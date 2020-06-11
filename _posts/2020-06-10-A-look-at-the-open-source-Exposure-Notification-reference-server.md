---
layout: post
title:  "A look at the open source Exposure Notification reference server"
date:   2020-06-10 09:00 -0700
categories: blog
---

In April, Google and Apple [announced](https://blog.google/inside-google/company-announcements/apple-and-google-partner-covid-19-contact-tracing-technology/) a joint effort to create APIs that enable the use of Bluetooth Low Energy (BLE) technology to assist in reducing the spread of the virus that causes COVID-19. As part of this broader effort [multiple resources](https://www.google.com/covid19/exposurenotifications/) have been made available to assist healthcare authorities to act swiftly. For instance, Google has released a reference Android application, additional terms of services for utilizing the exposure notifications API, specifications for cryptographic approach, and more. I have, [along with many others at Google](https://github.com/google/exposure-notifications-server/graphs/contributors), been creating an open source reference implementation of an Exposure Notifications server and wanted to elaborate on how this works.

The reference server, which works with Android and iOS clients, shows implementers how to author and deploy a backend to pair with mobile applications leveraging the newly added BLE interface. The [reference server source code](https://github.com/google/exposure-notifications-server) is available on GitHub alongside the existing [reference design for an Android app](https://github.com/google/exposure-notifications-android), both licensed under the Apache 2.0 license.

The reference server implementation consists of multiple components which together can be used to accept, validate, and store temporary exposure keys (TEKs) from verified mobile devices. It periodically generates and signs incremental files that will later be downloaded by clients to perform an on-device key matching algorithm which determines if two devices were in close proximity. The server components are stateless, so that they can scale independently based on demand. 

The repository also contains a [set of Terraform configurations](https://github.com/google/exposure-notifications-server/blob/master/docs/deploying.md) for easier deployment. While we have been using Google Cloud services, the reference server is designed to be platform-agnostic by using Kubernetes natively or in conjunction with Anthos, so it can be deployed on any cloud provider or on-premises infrastructure.

## An Overview of the Service
Taking a closer look at the implementation, there are a few high-level components that make up the reference server. Each component is a Google Cloud Run container and data is stored in a PostgreSQL database hosted on Google Cloud SQL. To walk through the components, I will group things by user interaction, starting with the voluntary sharing of temporary exposure keys (TEKs).

![Exposure Notification Server Diagram](https://google.github.io/exposure-notifications-server/images/google_cloud_run.png)
*Architecture Diagram of the Exposure Notification Server*

### Temporary Exposure Key Acceptance
The primary job of the Exposure Notification server is to accept the TEKs of positively diagnosed users from mobile devices, validating those keys originating from the mobile app via device attestation APIs, and storing those keys in the database. When a user of the mobile app is tested and informed they have a positive diagnosis, they can optionally share their exposure keys via the app. When this is done, the server accepts the user’s TEKs and stores them for a short time so that other devices can download them and confirm if they have interacted with these keys. 

### Generating Batches of Key for Download by Mobile Device
The number of users downloading TEKs will exceed that of those uploading keys. While not every user will need to upload TEKs, every user of the app will need to receive the TEKs that have been voluntarily uploaded. As every user will download the complete set of TEKs, we can further optimize this flow to better scale.

Rather than frequently querying the database, periodically the server generates incremental files for download by client devices for performing the key matching algorithm that is run on the mobile device. The incremental files must be digitally signed with a private key so they can be verified to be from the server. The corresponding public key is pushed to a mobile device separately to be used for this verification.

The reference design uses a CDN for public key distribution, which is backed by blob storage to scale better. Placing downloads behind a CDN and not accessing via a database query greatly reduces the load on the database.

### Cleanup of Older Temporary Exposure Keys and Batches
The final necessary function of the reference server is to clean up stale data. As the system exists to help inform users of possible exposure to the virus that causes COVID-19, it isn’t necessary to maintain this data for a long time. After 14 days the keys and batches are cleaned up. This serves a few purposes.

It ensures that, even though the keys held are not personally identifiable, the server persists the minimum required amount of information for the purposes of this service.

It helps to control the overall size of the data. This should assist in keeping query performance and the required storage fairly consistent over time.

### Additional Components and Enhancements

Our goal with the reference server was to provide a starting point for health authorities to build from. While the reference server is, itself, a complete implementation, care was taken to make it easy to extend. In fact, there already exist additional providers for many components. For instance, if you are unable to use Google Cloud services, such as Google Cloud Storage, [additional implementations of a blob storage interface are provided](https://github.com/google/exposure-notifications-server/blob/master/internal/storage/filesystem_storage.go).

#### Verifying a Positive Diagnosis
The current exposure notification server publish protocol doesn’t authenticate requests. To ensure the request came from an individual that has been exposed, a verification server should be used to certify that the diagnosis is from a public health authority in the jurisdiction. While we haven’t published a reference for the verification test, a design and protocol can be found in the [GitHub repository](https://github.com/google/exposure-notifications-server/blob/master/docs/design/verification_protocol.md).

#### Deploying Secret Management
While the TEKs are anonymised, secrets are still required to operate an exposure service, such as to control database access, provide authorization credentials, and manage private keys for signing download content.

This isn’t required but is strongly recommended. By default we leverage Google Cloud Secret Manager. The reference server includes implementations for additional [secret management systems](https://github.com/google/exposure-notifications-server/tree/master/internal/secrets).

#### Federation
One of the additional components we have invested time into is the concept of federation. It is quite possible that neighboring healthcare authorities may wish to share the TEKs they collect from their users. 

For example, imagine a set of neighboring states, provinces, or countries where travel between them is common. By sharing TEKs, it provides users a better understanding of their interactions. While this isn’t necessary in an environment where people do not cross jurisdictions, it is expected that, at least to some extent, it is unavoidable for many to not travel.

## Coming Together as a Global Community
There has never been a more important time to come together as a global community. That's why we're making this privacy-preserving server implementation available to health authorities, governments, auditors, and researchers. In publishing this open source code, our goal is to enable developers to leverage this reference implementation to get started quickly and slow the spread of COVID-19. Work is still ongoing and additional functionality is being added. For the most up to date information you can [follow the project](https://github.com/google/exposure-notifications-server/) and read the [reference documentation](https://google.github.io/exposure-notifications-server/) as this effort continues to develop. 