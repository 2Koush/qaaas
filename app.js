'use strict'

var MongoClient = require('mongodb').MongoClient;
const AWS = require('aws-sdk');
var ConversationV1 = require('watson-developer-cloud/conversation/v1');
const CiscoSpark = require(`ciscospark`);

let atlas_connection_uri;
let cachedDb = null;
let conversation = null;
let ciscospark = null;

exports.handler = (event, context, callback) => {
    var uri = process.env['MONGODB_ATLAS_CLUSTER_URI'];
    
    if (atlas_connection_uri != null) {
        processEvent(event, context, callback);
    } 
    else {
        const kms = new AWS.KMS();
        kms.decrypt({ CiphertextBlob: new Buffer(uri, 'base64') }, (err, data) => {
            if (err) {
                console.log('Decrypt error:', err);
                return callback(err);
            }
            atlas_connection_uri = data.Plaintext.toString('ascii');
            processEvent(event, context, callback);
        });
    } 
};

function processEvent(event, context, callback) {
    console.log('Calling MongoDB Atlas from AWS Lambda with event: ' + JSON.stringify(event));
    var jsonContents = JSON.parse(JSON.stringify(event));
    
    //the following line is critical for performance reasons to allow re-use of database connections across calls to this Lambda function and avoid closing the database connection. The first call to this lambda function takes about 5 seconds to complete, while subsequent, close calls will only take a few hundred milliseconds.
    context.callbackWaitsForEmptyEventLoop = false;
    
    try {
        if (cachedDb == null) {
            console.log('=> connecting to database');
            MongoClient.connect(atlas_connection_uri, function (err, db) {
                cachedDb = db;
                return findDoc(jsonContents, callback);
            });
        }
        else {
            console.log('=> using existing connection to database');
            return findDoc(jsonContents, callback);
        }
    }
    catch (err) {
        console.error('an error occurred', err);
    }
}

function findDoc (json, callback) {
    if (cachedDb) {
        cachedDb.collection('bots').find( {"spark_webhook": json.body.id} ).toArray(function(err, docs) {
            if(err!=null) {
                console.error("an error occurred in findDoc", err);
                callback(null, JSON.stringify(err));
            } else {
                console.log("Got results for find: " + json.body.id + "\r\r" + docs.length);
                if ((docs.length == 1) && (docs[0].spark_botEmail != json.body.data.personEmail)) {
                    findConversation(docs[0], json, callback);
                }
                else callback(null, "SUCCESS");
            }
        });
    } else {
        console.log("Could not connect to DB");
    }
};

function findConversation (botParams, json, callback) {
    if (conversation == null) {
        conversation = new ConversationV1({
            "username": botParams.watson_username,
            "password": botParams.watson_password,
            version_date: ConversationV1.VERSION_DATE_2017_05_26
        });
    }

    if (ciscospark == null) {
        ciscospark = CiscoSpark.init({
            "credentials": {
                "authorization": {
                    "access_token": botParams.spark_token
                }
            }
        });
    }
    
    if (conversation && ciscospark) {
        ciscospark.messages.get(json.body.data.id).then(function(message) {
            console.log(message);
            if (message.text) {
                console.log(json.body.data.roomType);
                console.log(json.body.data.mentionedPeople);
                console.log(botParams.spark_botId);
                console.log(botParams.spark_botName);
                console.log(message.text.indexOf('/a'));
                if ((json.body.data.roomType == 'group') && (json.body.data.mentionedPeople) && (json.body.data.mentionedPeople.indexOf(botParams.spark_botId) > -1) && 
                    message.text.startsWith(botParams.spark_botName) && (message.text.indexOf('/q') > 0)) {
                    var formattedResponse = message.text.substring(botParams.spark_botName.length + 1).trim();
                    if (formattedResponse.startsWith('/')) formattedResponse = formattedResponse.substring(1).trim();
                    if (formattedResponse.startsWith('q')) formattedResponse = formattedResponse.substring(1).trim();
                    console.log (formattedResponse);
                    var searchjson = {"spark_space": json.body.data.roomId};
                    var includeAnswers = false;
                    if (formattedResponse.startsWith('/all')) {
                    } else if (formattedResponse.startsWith('/')) {
                        formattedResponse = formattedResponse.substring(1).trim();
                        console.log (formattedResponse);
                        /*var words = formattedResponse.split(" ");
                        formattedResponse = formattedResponse.substring(words[0].length).trim();
                        console.log(formattedResponse);*/
                        searchjson.id = parseInt(formattedResponse);
                        includeAnswers = true;
                    } else if (!formattedResponse.startsWith('/')) {
                        searchjson.answered = false;
                    }
                    console.log('Query DB for questions');
                    cachedDb.collection('qa').find( searchjson ).toArray(function(err, question) {
                        console.log(question);
                        if (!err && question && question.length > 0) {
                            var text = "";
                            for(var i=0; i<question.length; i++) {
                                if (!question[i].answered) {
                                    text += ">  ⚠️ `/q/" + question[i].id + "` " + question[i].question + " [" + question[i].submittedBy + "]\n\n";
                                } else {
                                    text += "> `/q/" + question[i].id + "` " + question[i].question + " [" + question[i].answers[j].personEmail + "]\n\n";
                                    if (includeAnswers) {
                                        for (var j=0; j < question[i].answers.length; j++) {
                                            text += "> **A.** " +   answer + " [" + question[i].submittedBy + "]\n\n";
                                            if (j == (question[i].answers.length -1)) text += "\n\n";
                                        }
                                    }
                                }
                                if (i == question.length -1) {
                                    sendMessage(text, json.body.data.roomId, callback);
                                }
                            }
                        } else {
                            callback(null, JSON.stringify(err));
                        }
                    });
                } else if ((json.body.data.roomType == 'group') && (json.body.data.mentionedPeople) && (json.body.data.mentionedPeople.indexOf(botParams.spark_botId) > -1) && 
                    message.text.startsWith(botParams.spark_botName) && (message.text.indexOf('/a') > 0)) {
                    var formattedResponse = message.text.substring(botParams.spark_botName.length + 1).trim();
                    if (formattedResponse.startsWith('/')) formattedResponse = formattedResponse.substring(1).trim();
                    if (formattedResponse.startsWith('a')) formattedResponse = formattedResponse.substring(1).trim();
                    if (formattedResponse.startsWith('/')) formattedResponse = formattedResponse.substring(1).trim();
                    var words = formattedResponse.split(" ");
                    formattedResponse = formattedResponse.substring(words[0].length).trim();
                    console.log(formattedResponse);
                    console.log(words[0]);
                    console.log(json.body.data.roomId);
                    cachedDb.collection('qa').find( {"id": parseInt(words[0]), "spark_space": json.body.data.roomId} ).toArray(function(err, question) {
                        console.log("Found Question");
                        console.log(question);
                        if (!err && question && question.length == 1) {
                            var existingAnswers = question[0].answers;
                            existingAnswers.push({'personId': message.personId, 'personEmail': message.personEmail, 'answer': formattedResponse});
                            console.log(existingAnswers);
                            cachedDb.collection('qa').updateOne( {"id": parseInt(words[0]), "spark_space": json.body.data.roomId}, 
                                { $set: { "answered": true, "answers": existingAnswers } }, function(err, result) {
                                if(err!=null) {
                                    console.error("an error occurred in updating answers: ", err);
                                    callback(null, JSON.stringify(err));
                                } else {
                                    console.log("Send the answer out");
                                    var text = "<@personEmail:" + question[0].submittedBy + "|" + question[0].submittedBy + ">, This is what I found:\n";
                                    text += "> **Q.** " + question[0].question + "\n\n";
                                    text += "> **A.** " + formattedResponse;
                                    ciscospark.messages.create({"markdown": text, "toPersonEmail": question[0].submittedBy}).then(function(msg){
                                        text = "<@personEmail:" + json.body.data.personEmail + "|" + json.body.data.personEmail + 
                                            ">, your answer has been delivered to <@personEmail:" + question[0].submittedBy + "|" + question[0].submittedBy + ">";
                                        sendMessage(text, json.body.data.roomId, callback);
                                        //callback(null, "SUCCESS");
                                    }).catch(function(err){
                                        console.log(err);
                                        callback(null, JSON.stringify(err));
                                    });
                                }
                            });
                        } else {
                            callback(null, "SUCCESS");
                        }
                    });
                } else {
                    conversation.message({input: { "text": message.text }, "workspace_id": botParams.watson_workspace}, function(err, response) {
                        if (err) {
                            console.error(err);
                            callback(null, JSON.stringify(err));
                        } else {
                            console.log(JSON.stringify(response, null, 2));
                            console.log(response.output.text);
                            console.log(json.body.data.roomId);

                            if (response.output.text) {
                                findRules(botParams.spark_token, response.intents[0].intent).then(function(space){
                                    if (space && (space.length > 0)) {
                                        console.log("findConversation: Resend Question to " + space);
                                        var qId = Math.floor((new Date).getTime()/1000);
                                        addQuestionToDb({"id": qId, "spark_space": space, "question": message.text, "submittedBy": json.body.data.personEmail, "answered": false, "answers": []});
                                        var formattedResponse = "<@personEmail:" + json.body.data.personEmail + "|" + json.body.data.personEmail + "> asked: `" + message.text + "`";
                                        formattedResponse += "<br>Use <@personEmail:" + botParams.spark_botEmail + "|" + botParams.spark_botName + ">/a/" + qId + " to answer this question.";
                                        var text = "<@personEmail:" + json.body.data.personEmail + "|" + json.body.data.personEmail + ">, Let me check with my team and get back on this.";
                                        console.log(text);
                                        console.log(json.body.data.personEmail);
                                        ciscospark.messages.create({"markdown": text, "toPersonEmail": json.body.data.personEmail}).then(function(msg){
                                            sendMessage(formattedResponse, space, callback);
                                        }).catch(function(err){
                                            console.log(err);
                                            callback(null, JSON.stringify(err));
                                        });
                                    } else {
                                        console.log("findConversation: Send Watson Response to user.");
                                        sendMessage(response.output.text.toString(), json.body.data.roomId, callback);
                                    }
                                }).catch(function(err){
                                    console.log("Caugth Error: " + err);
                                    callback(null, "SUCCESS");
                                })
                            }
                        }
                    });
                }
            }
        });
    }
};

function findRules (token, intent) {
    return new Promise(function (fulfill, reject) {
        if (cachedDb) {
            cachedDb.collection('rules').find( {'spark_token': token, 'watson_intent': intent} ).toArray(function(err, docs) {
                if(err!=null) {
                    console.error("an error occurred in findRules", err);
                    reject(err);
                } else {
                    console.log("findRules: " + docs.length);
                    if (docs.length == 1) {
                        fulfill(docs[0].spark_space); 
                    } else {
                        console.log("findRules: Found 0 or more than 1 rule(s)");
                        fulfill("");
                    }
                }
            });
        } else {
            console.log("findRules: Could not connect to DB");
            reject("Could not connect to DB");
        }
    });
}

function addQuestionToDb(json) {
    if (cachedDb) {
        cachedDb.collection('qa').insertOne( json, function(err, result) {
            if(err!=null) {
                console.error("an error occurred in addQuestionToDb", err);
            } else {
                console.error("addQuestionToDb: Added question to DB");
            }
        });
    } else {
        console.log("addQuestionToDb: Could not connect to DB");
    }
}

function sendMessage(message, space, callback) {
    ciscospark.messages.create({"markdown": message, "roomId": space}).then(function(msg){
        callback(null, "SUCCESS");
    }).catch(function(err){
        console.log(err);
        callback(null, "FAILURE");  
    });
}
