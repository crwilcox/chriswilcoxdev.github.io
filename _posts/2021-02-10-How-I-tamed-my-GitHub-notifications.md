---
layout: post
title:  "How I tamed my GitHub notifications"
date:   2021-02-10 08:00 -0700
categories: blog
---

<img
  src="/images/2021-02-10-tamed-github-notifications/more-to-less-notifications.png" 
  alt="Less notifications make for a happier developer on GitHub">


One of the unique things about working on Google Cloud Client Libraries is the sheer volume of repositories I interact with. The Cloud Developer Relations team manages and releases libraries across 7+ languages and 300+ repositories. This creates a firehose of notifications that can quickly get out of hand. In my more focused area, storage and database products, there are 30+ repositories to keep an eye on. While I expect most folks using GitHub don’t have this particular problem, you may still have the core issue I encounter: not all issues are of equal importance; some in fact aren’t important at all.

# Digging out of the hole

When you have this many stale notifications, you sort of have to throw the idea of reading them out the window. I find the obvious thing to do at this point is:

1. Declare inbox bankruptcy
1. Mark everything done.
1. …
1. All is well now.

While this may seem like a great idea, I find it amounts to ‘kicking the can down the road’ more than it is solving the underlying problem; you will be right back to this situation in the near future. We have to find a way to stop the issues from being a noisy signal and turn it into an actionable workstream.

## Step 1: Stop the growth and move to an opt in model for notifications

By default GitHub ‘watches’ all of the repositories you are added to. As part of my work, I am added to many repositories that I interact with infrequently; for instance, some of these repositories contain core componentry, or helper packages, that are used across a broad set of libraries. By unchecking this box, it will stop my notifications from growing every time a new repository of this sort is added. 

![Don't Automatically Watch Notifications](/images/2021-02-10-tamed-github-notifications/automatic-watching.png)

## Step 2: Identify the noise
With Step 1 complete, I’d expect to see less growth of notifications moving forward. So the next part is figuring out where the existing notifications are coming from. What repositories currently have notifications to review?

### Github3.py
While the GitHub UI is great for a lot of things, there are some tasks where using the API is just easier.  This is one of those times. Luckily most languages have a library already for interacting with GitHub, in python I like to use [github3.py](https://github3py.readthedocs.io/en/master/)
```shell
$ pip install github3.py
```

Once installed, `github3.py` requires an API key which you can configure on [GitHub](https://github.com/settings/tokens). Also, I like to not store my access token in plain text in my files, so I use keyring to manage that for me.

```python
from collections import Counter
import getpass
from github3 import login
import keyring

access_token = keyring.get_password('github', 'notifications')
if access_token == None:
    access_token = getpass.getpass("Please enter your GitHub access token (will be saved to keyring)")
    keyring.set_password('github', 'notifications', access_token)

gh = login(token=access_token)
```

Once logged in, notifications can be retrieved from GitHub and the source repo can be extracted to a set we can print to the console.

```python
org_repos =  []
for notification in gh.notifications():
    url_segments = notification.subject['url'].split('/')
    repo = url_segments[-3]
    org = url_segments[-4]
    org_repos.append('/'.join((org, repo)))
    
unique_repos = Counter(org_repos)
print(f"Found {len(unique_repos)} repositories")

for repo in unique_repos:
   print(f"{repo}: {unique_repos[repo]}")

```

Which will return something that looks like 

```
Found 212 repositories
googleapis/python-firestore: 11
googleapis/python-storage: 22
googleapis/python-crc32c: 3
...
```

Also, if you don’t care about a count breakdown of your notifications, you can always view 
https://github.com/watching to get a breakdown of the repositories you watch. Note this won’t show things you are notified for due to a team so the list may be incomplete.

## Step 3: Tease out what is really important

Now that we have a list of repositories we are getting alerts from, we can start to separate out the types of projects we are involved in and which ones are making it hard to find the important notifications. You can start to see if there are repositories that are particularly noisy and of low-signal for you personally.

### Filter out high-volume, low signal notifications

When I think about notifications I think they fall into a few groups:

1. things you never need to be aware of.
2. things you need to sometimes be aware of or involved in.
3. things you need to be aware of
4. things you need to be involved in


### Unwatch repositories where you are unlikely to take an action from the notification.

Let’s start with the things you never need to be involved in. These may be projects that are far broader than your day to day work. They may also be projects you contributed to in the past but have since handed off to someone else. These notifications are making it hard to see other notifications that are more important.
If you go to the repository page, move notifications to ignore.
	
![Unwatch Repositories](/images/2021-02-10-tamed-github-notifications/unwatch.png)

I also treat the notifications I sometimes need to be aware of the same way, provided those projects have an owner. I find that I am more likely to get reached out to by another maintainer over email/chat for these, and that the notifications aren’t the useful stream of information. By ignoring these as well it helps me manage the information flow for the things I need to be aware of.

## Managing notifications for repositories you need to be aware of and involved in

With any luck, by the time you get here you are [watching](https://github.com/watching) a more reasonable number of repositories. For myself that seems to be in the 20-40 range, but that number may differ for you personally.

I have never found managing the emails from GitHub to be the best approach for myself, so I try to use the separate [GitHub Notifications Page](https://github.com/notifications). This pages has some helpful groupings as well that can help with the flow of things.

![Less Issues](/images/2021-02-10-tamed-github-notifications/less-issues.png)

Once tamed to be a reasonable number of notifications I found I could treat my notifications much the same way I treat email.

# Keeping this going
Keeping my notifications is still an active effort, but I find that having around 100x means I am far more likely to try than I previously was. I do have some additional tricks to handling this though.

Even for the repositories I should have awareness of, there are events that are a bit less useful. For instance, I find that PR merges tend to not be interesting to me. Merges happen once I have, or a teammate, has reviewed and ok’d the change. I also find the same to generally be true of closed issues.

That said, sometimes this rule doesn’t hold, so my workflow gives me a chance to catch these notifications before clearing them.

### My morning routine
1. Run an automated script that marks all merge and closed events as read notifications
    ![Running Script](/images/2021-02-10-tamed-github-notifications/script-run.png)
1. Go to [GitHub Notifications, filtered to is:read’](https://github.com/notifications?query=is%3Aread+)
1. Review these events. While seldom the case, some of these are more interesting. 
1. Once reviewed, select all, and mark done.
1. Now, go to the remaining notifications


### mark_read.py
This script will enumerate all closed and merged notifications to mark them as read. This helps to clear out some of the lower signal notifications before I review the rest.

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


While I am constantly evolving my approach to working across a variety of open source projects, I have found this system to work well for me and help to keep the value of notifications high and above the noise line.

Have thoughts on my approach or want to share your approach with me? Feel free to reach out on [twitter](https://twitter.com/chriswilcox47).
