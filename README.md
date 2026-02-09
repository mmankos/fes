# fes - Facebook Event Scraper
A Facebook event scraper that is AWS Lambda compatible and extracts events via both HTML-embedded data and the GraphQL API to capture all the events.

https://github.com/user-attachments/assets/8fb40eca-f6d9-4ac3-96a5-cc2817f9e45c

## ⚠️ Important Notice
When using this package to scrape Facebook events:
- Always respect the [robots.txt](https://en.wikipedia.org/wiki/Robots.txt) rules of the [target website](https://www.facebook.com/robots.txt).
- Only scrape data you are authorized to access.
- Excessive or unauthorized scraping may violate Facebook's terms of service.
- Use the `concurrency` option responsibly to avoid overloading servers.

## Instalation
```
npm install @mmankos/fes
```

## Local Usage
```
import { scrapeEvents } from "@mmankos/fes";

const sources = {
	eventID: ["1234567890", "0987654321"], // scrape specific events
	group: ["group1", "group2"], // scrape events from these Facebook groups
	page: ["page1", "page2", "page3"], // scrape events from these Facebook pages
	search_query: ["keyword1_1 keyword1_2", "keyword2"], // scrape events by keywords
};

// Optional scraping options
const options = {
    concurrency: 10, // max parallel requests
    eventsPerSourceLimit: undefined, // max amount of events to scrape per source
    httpReqRetries: 5, // retry failed requests
    httpReqRetryDelay: 1000, // wait 1s between retries
    httpReqTimeout: 5000, // timeout each HTTP request after 5s
    isAWS: false, // if true abide by the rules set by AWS Lambda (max one puppeteer browser instance at a time)
    outputFile: "events.json", // optionally save results to file
    proxyServer: undefined, // socks5 server address to route traffic through
    useProxy: false, // if true, and proxyServer option is set traffic is routed through the socks5 proxy
};

const scrapedEvents = await scrapeEvents(sources, options);
console.dir(scrapedEvents, { depth: null });
console.log(`TOTAL SCRAPED EVENTS: ${scrapedEvents.length}`);
```

---

## AWS Setup
This code can be deployed to AWS in two ways. First being compressing
everything into a zip archive of over 50MB, uploading to S3 and setting up
lambda using that S3 arn as a source.

However I prefer the second approach of creating a Lambda Layer for the
sparticuz/chromium, which leads to a lot slimmer <10MB zip archive which can be
uploaded to a lambda directly, this way you only have to upload to the S3 once,
compared to having to upload to S3 each time you want to update the Lambda code.
Also you retain the access to the web code editor.

### Compress the code into a zip
```
$ rm -rf node_modules package-lock.json
$ npm install --no-optional
$ zip -r test.zip index.mjs node_modules package.json package-lock.json
```

### Lambda Layer Setup
First you need to download the [chromium
layer](https://github.com/Sparticuz/chromium/releases) look for
**chromium-VERSION-layer.x64.zip** and upload that file to S3.

1. **Lambda -> Layers**
2. **Create layer**
3. Name the layer
4. Check **Upload a file from Amazon S3**
5. Insert the **Amazon S3 link URL**
6. **Create**

### Lambda Setup
1. **Lambda** -> **Functions**
2. **Create function**
3. Name the function
5. Runtime: **Node.js 22.x**
6. Architecture: **x86_64**
7. **Create function**

### Lambda Configuration
1. On the **Code** screen click **Add a layers** in the **Layers** section
2. Check **Custom layers** and choose the chromium layer from the dropdown
3. Click **Upload from** in the **Code source** section and upload the zip file we compressed at the start
3. In **General configuration** set **Memory** to 1024MB, **Timeout** to a reasonable value e.g. ~30 seconds

### Step Functions Setup
Due to the limitation of the Lambda (maximum 15 minutes of runtime) we had to
resort to only processing one event data batch per invocation.

1. **Step Functions** -> **State machines**
2. **Create state machine**
3. **Create from blank**
4. Name the state machine
5. **Continue**

### Step Functions Configuration
1. Click **Code**
2. Paste the example from *examples/stepfunction.asl.json*
3. Edit to match your Lambda arn

### Test
Now you are all done and ready to run some tests. The
*./examples/aws_example.mjs* does not do anything productive yet, it only types
out the number of events scraped, but it can be used as a boilerplate for a
more complicated handler.

## TODO
- [X] Make AWS Lambda compatible
- [X] Full Proxy support
