'use strict';

const path = require('path');
const fs = require('fs');
const util = require('util');

const FabricFront = require("../app/fabricfront").FabricFront;
const AccessControlMgr = require("../app/access_control_mgr").AccessControlMgr;

const LOGGER = require('loglevel');
//more docs here - https://github.com/pimterry/loglevel#documentation
LOGGER.setDefaultLevel('info');

const ORG_DIR = process.argv[2];
const WORKLOAD_PATH = process.argv[3];
const CHANNEL_NAME = process.argv[4];
const WORKLOAD_CHAINCODEID = process.argv[5];

LOGGER.info("Parameters: ")
LOGGER.info(`\t ORG_DIR : ${ORG_DIR}`);
LOGGER.info(`\t WORKLOAD_PATH : ${WORKLOAD_PATH}`);
LOGGER.info(`\t CHANNEL_NAME : ${CHANNEL_NAME}`);
LOGGER.info(`\t WORKLOAD_CHAINCODEID : ${WORKLOAD_CHAINCODEID}`);
LOGGER.info(`=============================================`);

var ACCESS_MGR;
var WORKLOAD = JSON.parse(fs.readFileSync(WORKLOAD_PATH));
var EXEC_START;
var ENCRYPT_START;
var ENCRYPT_TIME;
var TOTAL_REQ_COUNT = 0;
var BATCH_ID = 0;
var BATCH_EXEC_DELAY = 0;
var TOTAL_ELAPSED = 0;

const CONFIDENTIAL_DATA = "SECRET_PAYLOAD";
const WL_FUNC_NAME = "InvokeTxn"; // consistent to onchainview, secretcontract, noop, privateonchainview, privateonly contracts 

var ATTRIBUTES = {};
var COMMITTED_TXN_COUNT = 0;
var REJECTED_TXN_COUNT = 0;
var FABRIC_FRONT;

function PreparePubArg() {
    var pub_arg = "random_pub_arg";
    return pub_arg;
}

Promise.resolve().then(() => {
    var fabric_front;

    var peer_count = 1;
    if (process.env.PEER_COUNT) {
        peer_count = parseInt(process.env.PEER_COUNT);
    } else {
        LOGGER.error("Not setting global env var PEER_COUNT");
        process.exit(1);
    }
    var org_id = 1 + parseInt(process.pid) % peer_count;
    LOGGER.info(`Using ORG ${org_id}: `);
    const profile_path = path.resolve(ORG_DIR, `org${org_id}.example.com`, `connection-org${org_id}.json`);
    const mspId = `Org${org_id}MSP`;
    const cert_path = path.resolve(ORG_DIR, `org${org_id}.example.com`, "users", `Admin@org${org_id}.example.com`, "msp", "signcerts", `Admin@org${org_id}.example.com-cert.pem`);
    const key_path = path.resolve(ORG_DIR, `org${org_id}.example.com`, "users", `Admin@org${org_id}.example.com`, "msp", "keystore", "priv_sk");
    fabric_front = new FabricFront(profile_path, CHANNEL_NAME, mspId, cert_path, key_path);

    return fabric_front.InitNetwork();
}).then((fabric_front) => {
    FABRIC_FRONT = fabric_front;
    const accesscontrol_cintractID = "accesscontrol"; // only used in irrevocable mode;
    ACCESS_MGR = new AccessControlMgr(fabric_front, WORKLOAD_CHAINCODEID, accesscontrol_cintractID);
}).then(async () => {
    EXEC_START = new Date();
    var req_batches = WORKLOAD["transactions"];
    LOGGER.info(`# of Request Batches: ${req_batches.length}`);

    return req_batches.reduce(async (previousPromise, req_batch) => {
        await previousPromise;
        BATCH_ID += 1;
        var batch_req_count = req_batch.length;
        TOTAL_REQ_COUNT += batch_req_count;
        LOGGER.info(`Prepare to group ${batch_req_count} requests in batch ${BATCH_ID}`);
        // userinput = readline.question(`\nCONTINUE?\n`);

        var batch_start = new Date();
        var request_promises = [];
        for (var i = 0; i < batch_req_count; i++) {
            LOGGER.info(`\tRequest ${i} : ${JSON.stringify(req_batch[i])}`);
            var req = req_batch[i]
            var pub_arg = PreparePubArg();
            var req_promise = ACCESS_MGR.InvokeTxn(WL_FUNC_NAME, pub_arg, CONFIDENTIAL_DATA, req).then((result) => {
                var status_code = result[0];
                if (status_code !== 0) {
                    REJECTED_TXN_COUNT += 2;
                    return;
                } else { // For Revocable/Irrevocable/MockFabric Mode. Need to explicitly maintain views by appending operations. 
                    COMMITTED_TXN_COUNT += 2;

                    var txnID = result[1];
                    var raw_req = result[2];
                    var accessPolicy = raw_req["policy"];
                    ATTRIBUTES[txnID] = raw_req["attributes"];
                    ENCRYPT_START = new Date();
                    return ACCESS_MGR.AppendCipher(txnID, accessPolicy).then(() => { ENCRYPT_TIME = new Date() - ENCRYPT_START; });
                }
            });
            request_promises.push(req_promise);
        }
        await Promise.all(request_promises).then(() => {
            let batch_elapsed = new Date() - batch_start;
            LOGGER.info(`Batch ${BATCH_ID} Duration (ms): ${batch_elapsed} , # of reqs: ${batch_req_count} , # of committed txns: ${COMMITTED_TXN_COUNT} , # of rejected txns: ${REJECTED_TXN_COUNT} , encrypt time (ms): ${ENCRYPT_TIME}`)
            BATCH_EXEC_DELAY += batch_elapsed;
        });
    }, 0);
}).then(() => {
    TOTAL_ELAPSED = new Date() - EXEC_START;
}).catch((err) => {
    LOGGER.error("Invocation fails with err msg: " + err.stack);
}).finally(() => {
    let avg_batch_delay = Math.floor(BATCH_EXEC_DELAY / BATCH_ID);
    LOGGER.info(`Total Duration (ms): ${TOTAL_ELAPSED} ,  # of app txn:  ${TOTAL_REQ_COUNT} , Committed Txn Count: ${COMMITTED_TXN_COUNT} , avg batch delay (ms): ${avg_batch_delay} # of batches ${BATCH_ID}`);
    process.exit(0)
});



