# qaaas
Serverless Framework for Q &amp; A as a Service 

## Description of the Code
Anyone who is looked for a process for Q&A/FAQ on Webex Teams can use this code base. At the end, you will have a bot that can:
- First, check with Watson Assitant if there is a known intent of the message and translate it to a dialog if the intent is known.
- Pre-defined FAQs will be responded with an answer provided by Watson and delivered to the user by the bot
- If the question is unknown to Watson, the MongoDB will be **rules collection** queried for this intent.
- If the rule is found, it will route the question to the Webex Teams SME space.
- If the rule is not found, a default response of "I don't know how to answer this question" will be sent to the user.
- If you want all unknown questions to be routed to an expert space, configure the **anything_else** rule in the MongoDB to route to said space.

## Prerequisites 
- Watson Assistant (NLP Service)
- Mongo DB (stores 

## Application Architecture

### AWS
QA as a Service is hosted off of AWS Lambda written in Node.js 
- QAAAS Lambda - [app.js](https://github.com/CiscoCollabTME/qaaas/blob/master/app.js)
- QA as a Service listens for all requests in the form of HTTP to achieve this, we have hosted multiple resources on AWS API GW that calls Lambda for appropriate action.
- For example, a question will contain action=question and setup will contain action=setup, and route to Lambda code accordingly.

### MongoDB
One instance of QA as a Service on AWS can support multiple Webex Teams QA Bots. These bots are maintained in the Mongo DB.
Mongo DB stores the bot information, the rules that define qhich questions need to go to the subject matter expert Webex Team Space, and the historical Question and Answers. The **rules collection** maps intents to Webex Teams Subject Matter spaces.

### Watson
QAAAS has a Watson template in this code base (QaaaS_Template.json)[https://github.com/2Koush/qaaas/blob/master/QaaaS_Template.json], which defines all the base intents, entitites and dialog to define the NLP logic. Developers will need to add more details to the intents/entities/and dialog to customize their FAQs. 


