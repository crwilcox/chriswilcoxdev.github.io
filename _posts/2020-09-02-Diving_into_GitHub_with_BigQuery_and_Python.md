---
layout: post
title:  "Diving into GitHub with BigQuery and Python"
date:   2020-09-02 10:00 -0700
categories: blog
---

<img
  src="https://chriswilcox.dev/images/cloud_github_python_adds_to.png" 
  alt="Google Cloud + GitHub + Python = ?"
  height=128>
    

Most of the workplaces I have worked at, Google included, have some kind of performance evaluation system, usually yearly or bi-yearly. And without fail every one of these systems likes numbers. Because a lot of my work is done in the open, I have taken to diving into my GitHub usage to try and gain insights to what I am up to when evaluation time comes around. While the number of commits or lines of code you have commited don't translate directly to the impact of the work, they do often help to refresh my memory on where I spent time, the work I have done, and the sort of work I focus on to provide value. 

While GitHub has an API you can use directly and there are datasets you can download, such as [GH Archive](https://www.gharchive.org/), the data is also [available](https://console.cloud.google.com/marketplace/details/github/github-repos?filter=solution-type:dataset) on [Google BigQuery](https://cloud.google.com/bigquery) along with [other public datasets](https://console.cloud.google.com/marketplace/browse?filter=solution-type:dataset). This is useful since most live APIs, like GitHub's, will have rate limiting or quotas, may not be well indexed at the time of query, and may be awkward to do relational querying.

I like to use the [BigQuery Python libraries](https://pypi.org/project/google-cloud-bigquery/) to access BigQuery. You can use the online console as well, but I find it helpful to be able to script over the results.


```
!pip install google-cloud-bigquery
```

Once the library is installed interacting with BigQuery and making requests is familiar to most Pythonistas. For this work I find I usually use [colab](https://colab.research.google.com/), or a local [Jupyter](https://jupyter.org/) Notebook. I find that I can query and then easily dive in, filtering the data locally, and discover more in the data.

If you'd like you can follow along with the [Jupyter Notebook I used to create this post](/downloadable-content/diving_into_your_stats_with_GitHub_and_BigQuery.ipynb).

It is worth noting that a Google Cloud project is needed to connect to BigQuery. That said, there are helpful [quickstarts](https://cloud.google.com/bigquery/docs/quickstarts/quickstart-client-libraries) available to help accelerate onboarding. Also, BigQuery is included in the [Google Cloud free-tier](https://cloud.google.com/free), however many queries are large in size and can exhaust the allowance. As of authoring this, 1TB of queries per month are free of charge. Querying around a month of data from the GitHub dataset is ~225 GB.


```
# Follow these instructions to create a service account key:
# https://cloud.google.com/bigquery/docs/quickstarts/quickstart-client-libraries
# Then, replace the string below with the path to your service account key

export GOOGLE_APPLICATION_CREDENTIALS='/path/to/your/service-account-key.json'
```

## Configuring some variables and importing BigQuery

The first thing to do is set a few variables for the rest of the scripts. The BigQuery APIs need to know my `GOOGLE_CLOUD_PROJECT_ID` and the GitHub dataset queries will need to know the target user and the range of dates to look at.


```
GOOGLE_CLOUD_PROJECT_ID = "google-cloud-project-id"
GITHUB_USERNAME = 'crwilcox'
START_DATE = "2020-08-01"
END_DATE = "2020-09-01"

START_DATE_SUFFIX = START_DATE[2:].replace('-', '')
END_DATE_SUFFIX = END_DATE[2:].replace('-', '')


from google.cloud import bigquery

client = bigquery.client.Client(project=GOOGLE_CLOUD_PROJECT_ID)
```


## Digging into the dataset

As a starting point, let's look at all the data for a particular user. To start, let's take a look at events by type.


```
# Gather all events taken by a particular GitHub user
query = f"""SELECT type, event AS status,  COUNT(*) AS count
FROM (
  SELECT type, repo.name as repository, actor.login,
         JSON_EXTRACT(payload, '$.action') AS event, payload, created_at
  FROM `githubarchive.day.20*`
  WHERE actor.login = '{GITHUB_USERNAME}' AND
        created_at BETWEEN TIMESTAMP('{START_DATE}') AND
        TIMESTAMP('{END_DATE}') AND
        _TABLE_SUFFIX BETWEEN '{START_DATE_SUFFIX}' AND
        '{END_DATE_SUFFIX}'
)
GROUP BY type, status ORDER BY type, status;
"""
```

## An aside on cost and estimating query size
While 1 TB of querying is included in the free tier, many datasets in BigQuery are large, and it can be easy to exhaust that. There is a way in the library to test-run first to estimate the size of the query. It is wise to dry-run queries to consider the efficiency as well as the cost of execution. For instance, if I try to execute this query over the last 2.5 years, the query size is over 3 TB, whereas the last month is around 223 GB.


```
# Estimating the bytes processed by the previous query.
job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)
query_job = client.query(
    query,
    job_config=job_config,
)

gb_processed = query_job.total_bytes_processed / (1024*1024*1024)
print("This query will process {} GB.".format(gb_processed))

```

    This query will process 222.74764717370272 GB.


## Running a query and retrieving a dataframe

Now that the size of this query has been assessed, it can be executed and a [Pandas dataframe](https://pandas.pydata.org/pandas-docs/stable/reference/api/pandas.DataFrame.html) can be used to explore the results.



```
query_job = client.query(query)
result = query_job.result()
result.to_dataframe()
```




<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table border="1" class="dataframe">
  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>type</th>
      <th>status</th>
      <th>count</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>CreateEvent</td>
      <td>None</td>
      <td>605</td>
    </tr>
    <tr>
      <th>1</th>
      <td>DeleteEvent</td>
      <td>None</td>
      <td>255</td>
    </tr>
    <tr>
      <th>2</th>
      <td>ForkEvent</td>
      <td>None</td>
      <td>34</td>
    </tr>
    <tr>
      <th>3</th>
      <td>GollumEvent</td>
      <td>None</td>
      <td>2</td>
    </tr>
    <tr>
      <th>4</th>
      <td>IssueCommentEvent</td>
      <td>"created"</td>
      <td>678</td>
    </tr>
    <tr>
      <th>5</th>
      <td>IssuesEvent</td>
      <td>"closed"</td>
      <td>95</td>
    </tr>
    <tr>
      <th>6</th>
      <td>IssuesEvent</td>
      <td>"opened"</td>
      <td>174</td>
    </tr>
    <tr>
      <th>7</th>
      <td>IssuesEvent</td>
      <td>"reopened"</td>
      <td>2</td>
    </tr>
    <tr>
      <th>8</th>
      <td>MemberEvent</td>
      <td>"added"</td>
      <td>15</td>
    </tr>
    <tr>
      <th>9</th>
      <td>PublicEvent</td>
      <td>None</td>
      <td>1</td>
    </tr>
    <tr>
      <th>10</th>
      <td>PullRequestEvent</td>
      <td>"closed"</td>
      <td>678</td>
    </tr>
    <tr>
      <th>11</th>
      <td>PullRequestEvent</td>
      <td>"opened"</td>
      <td>443</td>
    </tr>
    <tr>
      <th>12</th>
      <td>PullRequestEvent</td>
      <td>"reopened"</td>
      <td>7</td>
    </tr>
    <tr>
      <th>13</th>
      <td>PullRequestReviewCommentEvent</td>
      <td>"created"</td>
      <td>582</td>
    </tr>
    <tr>
      <th>14</th>
      <td>PushEvent</td>
      <td>None</td>
      <td>2243</td>
    </tr>
    <tr>
      <th>15</th>
      <td>ReleaseEvent</td>
      <td>"published"</td>
      <td>90</td>
    </tr>
    <tr>
      <th>16</th>
      <td>WatchEvent</td>
      <td>"started"</td>
      <td>61</td>
    </tr>
  </tbody>
</table>
</div>



There are [20+ event types](https://developer.github.com/webhooks/event-payloads/) that can investigated further. Some of these events may be more interesting for a given use case. With the lens of performance reviews some events, for instance `WatchEvent` or [`GollumEvent`](https://developer.github.com/webhooks/event-payloads/#gollum), may be less interesting. However other events can be used to answer questions that may be more relevant, such as:

1. How many releases have been made?
2. How many pull requests have been opened?
3. How many issues have been created?
4. How many issues have been closed?



## Digging into stats by repository

When thinking about how I interact with GitHub I tend to think in terms of organization and repositories, in part due to the fact that I commit for work but also for side-projects.

By making some small changes to the query, grouping by repository, some new statistics can be derived.


```
query = f"""
SELECT repository, type, event AS status,  COUNT(*) AS count
FROM (
  SELECT type, repo.name as repository, actor.login,
         JSON_EXTRACT(payload, '$.action') AS event, payload, created_at
  FROM `githubarchive.day.20*`
  WHERE actor.login = '{GITHUB_USERNAME}' AND
        created_at BETWEEN TIMESTAMP('{START_DATE}') AND
        TIMESTAMP('{END_DATE}') AND
        _TABLE_SUFFIX BETWEEN '{START_DATE_SUFFIX}' AND
        '{END_DATE_SUFFIX}'
)
GROUP BY repository, type, status ORDER BY repository, type, status;
"""

query_job = client.query(query)
results = [i for i in query_job.result()]
```

While the query above could be made more precise, I find it easier to separate the data once in Python. Also, notice that Pandas isn't be used here but instead the result is being enumerated and used as a Python object.

From here higher-level information can be collected. For instance, how many releases have been published by the user, or how many pull requests have been created.


```
# Releases made
count = [int(row.count) for row in results
         if row.type == 'ReleaseEvent']
print(f"{sum(count)} Releases across {len(count)} repos")

# PRs Made
count = [int(row.count) for row in results
         if row.type == 'PullRequestEvent' and
         row.status == "\"opened\""]
print(f"{sum(count)} PRs opened across {len(count)} repos")

# PR Comments Left
count = [int(row.count) for row in results
         if row.type == 'PullRequestReviewCommentEvent']
print(f"{sum(count)} PR comments across {len(count)} repos")

# Issues Created
count = [int(row.count) for row in results
         if row.type == 'IssuesEvent' and
         row.status == "\"opened\""]
print(f"{sum(count)} issues opened across {len(count)} repos")

# Issues Closed
count = [int(row.count) for row in results
         if row.type == 'IssuesEvent' and
         row.status == "\"closed\""]
print(f"{sum(count)} issues closed across {len(count)} repos")

# Issue Comments
count = [int(row.count) for row in results
         if row.type == 'IssueCommentEvent']
print(f"{sum(count)} issue comments across {len(count)} repos")

# Push Events
count = [int(row.count) for row in results
         if row.type == 'PushEvent']
print(f"{sum(count)} pushes across {len(count)} repos")
```

    0 Releases across 0 repos
    3 PRs opened across 3 repos
    61 PR comments across 8 repos
    6 issues opened across 3 repos
    2 issues closed across 1 repos
    17 issue comments across 9 repos
    78 pushes across 13 repos


So there are a lot of different event types, each with payloads to look at further.

## For something different...


Of course, there are some less productive and more entertaining things we can search for. For instance, how many times have I committed a linting fix...


```
# How often do I forget to run the tests before committing?
query = f"""
  SELECT type, repo.name as repository, JSON_EXTRACT(payload, '$.commits') as commits,
        actor.login, created_at
  FROM `githubarchive.day.20*`
  WHERE actor.login = '{GITHUB_USERNAME}' AND type = "PushEvent"
        AND created_at BETWEEN TIMESTAMP('{START_DATE}') AND
        TIMESTAMP('{END_DATE}') AND
        _TABLE_SUFFIX BETWEEN '{START_DATE_SUFFIX}' AND
        '{END_DATE_SUFFIX}'
"""

query_job = client.query(query)
result = query_job.result()
df = result.to_dataframe()
df

```




<div>
<style scoped>
    .dataframe tbody tr th:only-of-type {
        vertical-align: middle;
    }

    .dataframe tbody tr th {
        vertical-align: top;
    }

    .dataframe thead th {
        text-align: right;
    }
</style>
<table border="1" class="dataframe">
  <thead>
    <tr style="text-align: right;">
      <th></th>
      <th>type</th>
      <th>repository</th>
      <th>commits</th>
      <th>login</th>
      <th>created_at</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>0</th>
      <td>PushEvent</td>
      <td>googleapis/python-firestore</td>
      <td>[{"sha":"91d6580e2903ab55798d66bc53541faa86ca7...</td>
      <td>crwilcox</td>
      <td>2020-08-13 16:53:15+00:00</td>
    </tr>
    <tr>
      <th>1</th>
      <td>PushEvent</td>
      <td>googleapis/python-firestore</td>
      <td>[{"sha":"f3bedc1efae4430c6853581fafef06d613548...</td>
      <td>crwilcox</td>
      <td>2020-08-13 16:53:18+00:00</td>
    </tr>
    <tr>
      <th>2</th>
      <td>PushEvent</td>
      <td>crwilcox/python-firestore</td>
      <td>[{"sha":"cdec8ec0411c184868a2980cdf0c94470c936...</td>
      <td>crwilcox</td>
      <td>2020-08-06 02:58:25+00:00</td>
    </tr>
    <tr>
      <th>3</th>
      <td>PushEvent</td>
      <td>crwilcox/python-firestore</td>
      <td>[{"sha":"afff842a3356cbe5b0342be57341c12b2d601...</td>
      <td>crwilcox</td>
      <td>2020-08-06 05:55:58+00:00</td>
    </tr>
    <tr>
      <th>4</th>
      <td>PushEvent</td>
      <td>crwilcox/python-firestore</td>
      <td>[{"sha":"c93a077d6d00bc6e3c5070a773add309b0439...</td>
      <td>crwilcox</td>
      <td>2020-08-06 05:57:55+00:00</td>
    </tr>
    <tr>
      <th>...</th>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
      <td>...</td>
    </tr>
    <tr>
      <th>73</th>
      <td>PushEvent</td>
      <td>crwilcox/python-firestore</td>
      <td>[{"sha":"b902bac30ad17bbc02d51d1b03494e089ca08...</td>
      <td>crwilcox</td>
      <td>2020-08-04 17:34:22+00:00</td>
    </tr>
    <tr>
      <th>74</th>
      <td>PushEvent</td>
      <td>googleapis/google-auth-library-python</td>
      <td>[{"sha":"e963b33cee8c93994c640154d5b965c4e3ac8...</td>
      <td>crwilcox</td>
      <td>2020-08-07 21:10:53+00:00</td>
    </tr>
    <tr>
      <th>75</th>
      <td>PushEvent</td>
      <td>GoogleCloudPlatform/python-docs-samples</td>
      <td>[{"sha":"86dbbb504f63149f7d393796b2530565c285e...</td>
      <td>crwilcox</td>
      <td>2020-08-12 17:28:08+00:00</td>
    </tr>
    <tr>
      <th>76</th>
      <td>PushEvent</td>
      <td>googleapis/python-firestore</td>
      <td>[{"sha":"7122f24d0049ecad4e71cbac4bcb326eb8dd4...</td>
      <td>crwilcox</td>
      <td>2020-08-20 19:36:16+00:00</td>
    </tr>
    <tr>
      <th>77</th>
      <td>PushEvent</td>
      <td>crwilcox/exposure-notifications-verification-s...</td>
      <td>[{"sha":"f087f323d0558436dc849aab80168abb11377...</td>
      <td>crwilcox</td>
      <td>2020-08-05 19:21:51+00:00</td>
    </tr>
  </tbody>
</table>
<p>78 rows × 5 columns</p>
</div>



Looking at the first result the shape of the json data can be better understood. There is a message field that could be queried against.


```
df["commits"][0]
```




    '[{"sha":"ce97f5e939bcdca1c9c46f472f41ead04ac6b2fe","author":{"name":"Chris Wilcox","email":"1a61e7a0041d068722f1c352424109b22f854ce0@google.com"},"message":"fix: lint","distinct":true,"url":"https://api.github.com/repos/crwilcox/python-firestore/commits/ce97f5e939bcdca1c9c46f472f41ead04ac6b2fe"}]'


```
len(df[df['commits'].str.contains("lint")])
```

So, seems about 14% (11/78) of my commits last month. Seems someone could be a bit better about running the test suite *first* 😅






## Back to something slightly more productive

For some of the projects I work on [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) syntax is used. This can provide an idea of the type of work I am doing. For now I ignore non-conventional commits, combining them together.


```
import json
from collections import Counter

commit_types = Counter()

types = [
  "fix", "feat", "chore", "docs", "style",
  "refactor", "perf", "test", "revert"
]
for i in range(len(df)):
  commits = df.loc[i, "commits"]
  json_commits = json.loads(commits)
  for commit in json_commits:
    # If the first line contains a : assume the left side is the type.
    found_type = False
    for t in types:
      if commit['message'].startswith(t):
        commit_types[t] += 1
        found_type = True
        break
    else:
      commit_types["non-conventional"] += 1

commit_types
```




    Counter({'chore': 21,
             'docs': 3,
             'feat': 14,
             'fix': 26,
             'non-conventional': 107,
             'refactor': 8,
             'test': 2})



It seems that most of my commits are fixes, a decent number are chores, and next is feature implementation. Unfortunately a sizable number of commits for the period aren't conventional commits, though it is likely safe to assume the trend is similar for those commits.

## What uses can you discover for this data?

I don't think I can hope to scrape the surface on what you could use this data for, though I find it enlightening to see where I spend my time on GitHub and how my time in different repositories breaks down. Here are a few more thoughts on how you might use this dataset though.

1. Get all GitHub issues for a repository.
2. Get all GitHub issues created by you.
3. Get all Issue comments.
4. Get all PR comments.

Queries for these are below. Feel free to [reach out](https://twitter.com/chriswilcox47) if you have thoughts on other useful queries you think should be included.


#### Get all GitHub issues for a repository.

```
GITHUB_ORGANIZATION = 'googleapis' #@param {type:"string"}
GITHUB_REPOSITORY = 'python-%' #@param {type:"string"}

# Get all GitHub issues in a repository. In the example, a wildcard is used
# to get all issues 

query = f"""
  SELECT type, repo.name as repository, JSON_EXTRACT(payload, '$.pull_request.title') as title, actor.login, 
         JSON_EXTRACT(payload, '$.action') AS event, JSON_EXTRACT(payload, '$.pull_request.html_url') as url, created_at
  FROM `githubarchive.day.20*`
  WHERE repo.name LIKE '{GITHUB_ORGANIZATION}/{GITHUB_REPOSITORY}' AND type = "PullRequestEvent"
        AND created_at BETWEEN TIMESTAMP('{START_DATE}') AND
        TIMESTAMP('{END_DATE}') AND
        _TABLE_SUFFIX BETWEEN '{START_DATE_SUFFIX}' AND
        '{END_DATE_SUFFIX}'
"""

query_job = client.query(query)
result = query_job.result()
result.to_dataframe()

```

#### Get all GitHub issues created by you.

```
# Get all GitHub issues by this login
query = f"""
  SELECT type, repo.name as repository, JSON_EXTRACT(payload, '$.issue.title') as title, actor.login,
         JSON_EXTRACT(payload, '$.action') AS event, JSON_EXTRACT(payload, '$.issue.html_url') as url, created_at
  FROM `githubarchive.day.20*`
  WHERE actor.login = '{GITHUB_USERNAME}' AND type = "IssuesEvent"
        AND created_at BETWEEN TIMESTAMP('{START_DATE}') AND
        TIMESTAMP('{END_DATE}') AND
        _TABLE_SUFFIX BETWEEN '{START_DATE_SUFFIX}' AND
        '{END_DATE_SUFFIX}'
"""

query_job = client.query(query)
result = query_job.result()
result.to_dataframe()


```

#### Get all Issue comments.

```
# Get all issue comments
query = f"""
  SELECT type, repo.name as repository, actor.login,
       JSON_EXTRACT(payload, '$.action') AS event, JSON_EXTRACT(payload, '$.issue.html_url') as url, created_at
  FROM `githubarchive.day.20*`
  WHERE actor.login = '{GITHUB_USERNAME}' AND type = "IssueCommentEvent"
      AND created_at BETWEEN TIMESTAMP('{START_DATE}') AND
        TIMESTAMP('{END_DATE}') AND
        _TABLE_SUFFIX BETWEEN '{START_DATE_SUFFIX}' AND
        '{END_DATE_SUFFIX}'
"""
query_job = client.query(query)
result = query_job.result()
result.to_dataframe()


```

#### Get all PR comments.

```
# Get all PR comments created by this login
query = f"""
  SELECT type, repo.name as repository, actor.login,
         JSON_EXTRACT(payload, '$.action') AS event, JSON_EXTRACT(payload, '$.comment.html_url') as url, created_at
  FROM `githubarchive.day.20*`
  WHERE actor.login = '{GITHUB_USERNAME}' AND type = "PullRequestReviewCommentEvent"
        AND created_at BETWEEN TIMESTAMP('{START_DATE}') AND
        TIMESTAMP('{END_DATE}') AND
        _TABLE_SUFFIX BETWEEN '{START_DATE_SUFFIX}' AND
        '{END_DATE_SUFFIX}'
"""

query_job = client.query(query)
result = query_job.result()
result.to_dataframe()
```
