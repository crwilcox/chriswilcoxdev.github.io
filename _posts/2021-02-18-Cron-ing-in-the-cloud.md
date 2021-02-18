---
layout: post
title:  "Cron-ing in the Cloud: How to use Cloud Scheduler to automate routine tasks"
date:   2021-02-18 08:00 -0700
categories: blog
---

![Cloud Scheduler triggered Cloud Functions](/images/2021-02-18-cron-ing-in-the-cloud/scheduler_functions.png)

Last week I wrote about [taming my github notifications](https://chriswilcox.dev/blog/2021/02/10/How-I-tamed-my-GitHub-notifications.html) and I thought I would follow that post up
by talking about automating the automation - or - how I use the cloud as my own
personal computer :)

I currently do not have a desktop style computer. As part of traveling and liking the ability to move about my house as I do my work, I have moved to relying on laptop computers. There is a downside to this though: I don’t really have a place to easily run scheduled tasks as I never know if the computer will be on at that time. Enter [Cloud Scheduler](https://cloud.google.com/scheduler).

Running scripts on a schedule, or an external trigger, is a common practice and Google Cloud Scheduler makes this possible while not having to be sure I have a computer running in my home. Further, the free tier of Cloud Scheduler allows you to specify [3 jobs for free](https://cloud.google.com/scheduler/pricing), no matter how many times the job is run. Each job after that is USD$0.10 each. Do note you may also incur costs for excess [Cloud Functions](https://cloud.google.com/functions/pricing) execution time, database costs, etc.

Using my script I created for managing my GitHub notifications as motivation, let’s break down how to use Cloud Scheduler and [Google Cloud Functions](https://cloud.google.com/functions) to routinely execute code. Also, shoutout to my coworkers [Katie McLaughlin](https://twitter.com/glasnt) and [Martin Omander](https://twitter.com/martinomander) for their video about this very subject. [Check it out on YouTube](https://www.youtube.com/watch?v=XIwbIimM49Y) if that style is easier for you. They leverage [Cloud Run](https://cloud.google.com/run) instead of Cloud Functions, but it is very similar to this post.


# An overview

So, we already have a bit of code running locally. At a high-level to get this in the cloud we need to 

1. Wrap it in an entry point that can be invoked by a Cloud Function
2. Deploy the code to Cloud Functions using [`gcloud`](https://cloud.google.com/sdk/docs), a CLI that helps to interact with [Google Cloud](https://cloud.google.com/)
3. Create a Cloud Scheduler job that triggers the Cloud Function on a routine.


# Modifying the script to work with Cloud Functions

From my [last post](https://chriswilcox.dev/blog/2021/02/10/How-I-tamed-my-GitHub-notifications.html), we have the following code to start from.

```python
import getpass
from github3 import login
import keyring

access_token = keyring.get_password('github', 'notifications')
if access_token == None:
   access_token = getpass.getpass("Please enter your GitHub access token (will be saved to keyring)")
   keyring.set_password('github', 'notifications', access_token)

gh = login(token=access_token)

notifications_to_mark = []
for notification in gh.notifications():
   url_segments = notification.subject['url'].split('/')
   number = url_segments[-1]
   repo = url_segments[-3]
   org = url_segments[-4]

   try:
       if notification.subject['type'] == 'PullRequest':
           pr = gh.repository(org, repo).pull_request(int(number))
           if pr.state == 'closed':
               notifications_to_mark.append(notification)

       elif notification.subject['type'] == 'Issue':
           issue = gh.repository(org, repo).issue(int(number))
           if issue.state == 'closed':
               notifications_to_mark.append(notification)
   except Exception as e:
       print(e)

unique_repos = set([n.subject['url'][:-1] for n in notifications_to_mark])
print(f"Found {len(notifications_to_mark)} to mark read across {len(unique_repos)} repositories")

input("Press ENTER to mark items read.")

for n in notifications_to_mark:
   print(f"Marking {n.subject['url']}")
   n.mark()

```

There are a few things we need to change in this code to make it work as a Cloud Function:

1. This code is formatted as a runnable script, not a python module.
2. Cloud Functions cannot request access to keyring while running

3. As Cloud Functions run an HTTP endpoint, they expect a response.




## Create an entrypoint for cloud functions
The next step to take is to move this from being a script that is exec'd on the
command line, and move it to a script that a Cloud Function runner can invoke.
Cloud Functions expects a Python function so the simplest thing to do is move
the code that was previously written under a function.

```python
def mark_read(request):
    gh = login(token=access_token)
    notifications_to_mark = []
    for notification in gh.notifications():
        ...
```


## Replacing keyring use with a Cloud Functions environment variable

As I initially created this to run on my laptop I leveraged a package called
`keyring` to store my access token. However, this requires the user to enter
their password to gain access to the secret. Since moving to Cloud Functions
makes this non-interactive, I moved the secret to an environment variable.


### Before

```python
access_token = keyring.get_password('github', 'notifications')
gh = login(token=access_token)
```


### After

```python
access_token = os.getenv("GITHUB_ACCESS_TOKEN") # 🤔
gh = login(token=access_token)
```

You might be saying to yourself "but wait, that is just a plain text environment
variable. Should I really just put that like that in the cloud? That seems bad".

And that would be a good instinct. While you could do that, it would be best to
instead use an encrypted secret. Luckily this is relatively straightforward
using secret manager. Let's add a new function, `get_access_token` to abstract
that code from the notifications processor.

Later on this post discusses how to add that secret to
[Google Cloud Secret Manager](https://cloud.google.com/secret-manager#:~:text=Secret%20Manager%20is%20a%20secure,audit%20secrets%20across%20Google%20Cloud.).

```python
from google.cloud import secretmanager

def get_access_token():
    if "GITHUB_ACCESS_TOKEN_LOCATION" in os.environ:
        client = secretmanager.SecretManagerServiceClient()
        name=os.getenv("GITHUB_ACCESS_TOKEN_LOCATION")
        access_token = client.access_secret_version(name=name).payload.data.decode("UTF-8")
    elif "GITHUB_ACCESS_TOKEN" in os.environ:
        # Allow the use of an environment variable. Though it would be better
        # if a Cloud Secret was used.
        access_token = os.getenv("GITHUB_ACCESS_TOKEN")

    return access_token

def mark_read(request):
    gh = login(token=get_access_token())
   ...
```


## Add a return value

For a Cloud Function to be considered 'successful' it should return content.
For this reason, I change the final print to return that information. Whatever
is returned will be output as the response to the POST request.

```python
    return f"Marked {len(notifications_to_mark)} read across {len(unique_repos)} repositories"
```

Also, print statements are captured by [Google Cloud Logging](https://cloud.google.com/logging).
Cloud Functions includes simple runtime logging and will gather `stdout` and `stderr`.
So, while a logging library could be used, `print` statements are sufficient.


## The End Result

So after these changes, the script is:

```
# requirements.txt
github3.py==1.3.0
google-cloud-secret-manager==2.2.0
```

```python
import os
from github3 import login
from google.cloud import secretmanager


def get_access_token():
    if "GITHUB_ACCESS_TOKEN_LOCATION" in os.environ:
        client = secretmanager.SecretManagerServiceClient()
        name = os.getenv("GITHUB_ACCESS_TOKEN_LOCATION")
        access_token = client.access_secret_version(name=name).payload.data.decode(
            "UTF-8"
        )
    elif "GITHUB_ACCESS_TOKEN" in os.environ:
        # Allow the use of an environment variable. Though it would be better
        # if a Cloud Secret was used.
        access_token = os.getenv("GITHUB_ACCESS_TOKEN")

    return access_token


def mark_read(request):
    gh = login(token=get_access_token())
    notifications_to_mark = []
    for notification in gh.notifications():
        # url is of form https://api.github.com/repos/googleapis/nodejs-dialogflow/pulls/264'
        # state change indicates pr/issue status change
        url_segments = notification.subject["url"].split("/")
        number = url_segments[-1]
        repo = url_segments[-3]
        org = url_segments[-4]
        try:
            if notification.subject["type"] == "PullRequest":
                pr = gh.repository(org, repo).pull_request(int(number))
                if pr.state == "closed":
                    notifications_to_mark.append(notification)

            elif notification.subject["type"] == "Issue":
                issue = gh.repository(org, repo).issue(int(number))
                if issue.state == "closed":
                    notifications_to_mark.append(notification)
        except Exception as e:
            print(e)

    unique_repos = set([n.subject["url"][:-1] for n in notifications_to_mark])
    print(
        f"Found {len(notifications_to_mark)} to mark read across {len(unique_repos)} repositories"
    )

    for n in notifications_to_mark:
        print(f"Marking {n.subject['url']}")
        n.mark()

    response = f"Marked {len(notifications_to_mark)} read across {len(unique_repos)} repositories"
    print(response)
    return response

```


# Using gcloud to interact with Google Cloud

Now that we have a Cloud Function ready Python module, we need to deploy the code to a
Cloud Function. While you could use the [Cloud Console](http://console.cloud.google.com/)
to do everything below, I'll be showing how to use `gcloud` to do this.

You can find instructions for installing gcloud on a variety of platforms [here](https://cloud.google.com/sdk/docs/install)

First thing to do is to create a few environment variables to be used by future commands:
```sh
REGION=us-central1
PROJECT_ID=my-project
GITHUB_ACCESS_TOKEN=your-access-token
```

Next, before we move on, it is a good idea to ensure you are logged in and addressing
the correct project.

```sh
gcloud auth login
gcloud config set project $PROJECT_ID
```

You don't need to run this every time before running commands but, especially if
you use multiple cloud projects, it is good to ensure you are targeting the right project.


# Permissions
Whenever deploying anything to the cloud, it is good to start by thinking about
access policies. In Google Cloud, we can create service accounts with limited
permissions. For this instance, the service account needs the ability to invoke
a Cloud Function.

This will be used later when configuring Cloud Scheduler.

```sh
gcloud iam service-accounts create gh-notifications-sa \
   --display-name "gh notifications service account"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
   --member serviceAccount:gh-notifications-sa@${PROJECT_ID}.iam.gserviceaccount.com \
   --role roles/cloudfunctions.invoker

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
   --member serviceAccount:gh-notifications-sa@${PROJECT_ID}.iam.gserviceaccount.com \
   --role roles/secretmanager.secretAccessor
```


# Add a secret to Secret Manager

Earlier a function was added to use a secret rather than a local environment variable.

Now it's time to add that secret to Google Cloud.

```sh
echo "s3cr3t" | gcloud secrets create github-access-token --data-file=- --replication-policy=automatic
GITHUB_ACCESS_TOKEN_LOCATION=="projects/$PROJECT_ID/secrets/github-access-token/versions/latest"
```

# Deploying your Cloud Function

The next step, now that we have a Service Account, is to deploy the cloud function.

```sh
gcloud functions deploy scrub-github-notifications \
      --trigger-http \
      --region us-central1 \
      --runtime python39 \
      --entry-point mark_read \
      --service-account gh-notifications-sa@${PROJECT_ID}.iam.gserviceaccount.com \
      --no-allow-unauthenticated \
      --set-env-vars GITHUB_ACCESS_TOKEN_LOCATION=${GITHUB_ACCESS_TOKEN_LOCATION}
```

Breaking this down, we use an HTTP Trigger, to run a Python 3.9 function,
in the us-central1 region.
This function doesn't allow unauthenticated access which prevents callers that
aren't the specified service account from invoking it. The command also provides
an environment variable to configure and the name of the entry-point.


# Creating a Cloud Scheduler
Next the Cloud Scheduler that invokes the Cloud Function.

```sh
gcloud scheduler jobs create http scrub-gh-notifications-job \
  --description "Scrub GitHub Notifications hourly working hours" \
  --schedule "0 07-18 * * *" \
  --time-zone "US/Pacific" \
  --uri "https://${REGION}-${PROJECT_ID}.cloudfunctions.net/scrub-github-notifications" \
  --http-method POST \
  --oidc-service-account-email gh-notifications-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --message-body '{"name": "Triggered by Cloud Scheduler"}'
```


## The schedule arguments
Let's start by looking at the arguments related to frequency.

```sh
  --schedule "0 07-18 * * *"
  --time-zone "US/Pacific"
```

Cloud Scheduler uses [unix-cron](https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules) format. The above says 
"between 7AM and 6PM, in the specified timezone, run every hour"


## The trigger
Now, on to what we are triggering:

```sh
  --uri "https://${REGION}-${PROJECT_ID}.cloudfunctions.net/scrub-github-notifications" \
  --http-method POST \
  --oidc-service-account-email gh-notifications-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --message-body '{"name": "Triggered by Cloud Scheduler"}'
```

This will make a POST Request to the specified `uri`, using the service account.
It also sends a `message-body` which, since in this case we don't require input,
just states what triggered the function.


# And just like that, my other computer is the cloud
And just like that, you can now let everyone know that you use the cloud as your own personal computer!

For some bonus content, did you know you can test your cloud functions locally?
You can use the [Python Functions Framework](https://github.com/GoogleCloudPlatform/functions-framework-python) to run your Cloud Function on your machine and experiment
before deploying!

```sh
pip install functions_framework
functions-framework --target mark_read
```

For a more in depth look at this you can read more in
[this post](https://dev.to/googlecloud/portable-cloud-functions-with-the-python-functions-framework-a6a)
by [Dustin Ingram](https://twitter.com/di_codes).
