'use strict';

const readline = require('readline-sync');
const path = require('path');
const fs = require('fs');
const FabricFront = require("./fabricfront").FabricFront;
const AccessControlMgr = require("./access_control_mgr").AccessControlMgr;
const global = require('./global.js');
const LOGGER = require('loglevel');

//more docs here - https://github.com/pimterry/loglevel#documentation
LOGGER.setDefaultLevel('info')

var ACCESS_MGR;
const PUBLIC_DATA = "PUBLIC_PAYLOAD";
const CONFIDENTIAL_DATA = "SECRET_PAYLOAD";
const CHANNEL_NAME = "accesschannel";
const ACCESS_POLICY = "activeTrue and (roleAdmin or roleUser) and (depSales or depMarketing)";
const userPrvKey = fs.readFileSync("./user_prvkey.key", 'utf8');
var WORKLOAD_CHAINCODEID;

const WL_FUNC_NAME = "InvokeTxn"; // consistent to onchainview, secretcontract, noop, privateonchainview, privateonly contracts 

var USER_INPUT;
/////////////////////////////////////////////////////////////
// Below are expected to execute at the U1 side, who invokes the transaction and creates the view. 
Promise.resolve().then(() => {
    const network_dir = "test-network";
    const profile_path = path.resolve(__dirname, '..', network_dir, 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
    const mspId = "Org1MSP";
    const cert_path = path.resolve(__dirname, '..', network_dir, 'organizations', 'peerOrganizations', 'org1.example.com', "users", `Admin@org1.example.com`, "msp", "signcerts", `Admin@org1.example.com-cert.pem`);
    const key_path = path.resolve(__dirname, '..', network_dir, 'organizations', 'peerOrganizations', `org1.example.com`, "users", `Admin@org1.example.com`, "msp", "keystore", "priv_sk");
    var fabric_front = new FabricFront(profile_path, CHANNEL_NAME, mspId, cert_path, key_path);
    return fabric_front.InitNetwork();
}).then((fabric_front) => {
    LOGGER.info("===============================================");

    WORKLOAD_CHAINCODEID = "secretcontract";

    const accesscontrol_cintractID = "accesscontrol";
    ACCESS_MGR = new AccessControlMgr(fabric_front, WORKLOAD_CHAINCODEID, accesscontrol_cintractID);

    LOGGER.info("===============================================");
    LOGGER.info(`1. A user invokes a transaction with public data ${PUBLIC_DATA} and confidential data ${CONFIDENTIAL_DATA}.`);
    return ACCESS_MGR.InvokeTxn(WL_FUNC_NAME, PUBLIC_DATA, CONFIDENTIAL_DATA, 1);
}).then((txn_info) => {
    var txn_status = txn_info[0];
    var txnID = txn_info[1];
    USER_INPUT = readline.question(`\nCONTINUE?\n`);
    LOGGER.info("===============================================");
    LOGGER.info(`2. The transaction owner appends an access policy ${ACCESS_POLICY} to the transaction ${txnID}.`);
    return ACCESS_MGR.AppendCipher(txnID, ACCESS_POLICY);
}).then((result) => {
    var txnID = result[0];
    var time = result[1];
    USER_INPUT = readline.question(`\nCONTINUE?\n`);
    LOGGER.info("===============================================");
    LOGGER.info(`3. The admin user query the transaction ${txnID} key with encrypt in ${time} ms.`);
    return ACCESS_MGR.GetOnChainKey(txnID, userPrvKey);
}).then((txnID) => {
    USER_INPUT = readline.question(`\nCONTINUE?\n`);
    LOGGER.info("===============================================");
    LOGGER.info("4. The admin destributes the key to the users");
    return ACCESS_MGR.DistributeKey(txnID, ACCESS_POLICY);
}).then((result) => {
    var distributedData = result[0];
    const time = result[1];
    USER_INPUT = readline.question(`\nCONTINUE?\n`);
    LOGGER.info("===============================================");
    LOGGER.info(`5. The user receives the key from the admin with ${time} ms encrypt time.`);
    return ACCESS_MGR.OnReceive(distributedData, userPrvKey);
}).then((payload) => {
    LOGGER.info("===============================================");
    USER_INPUT = readline.question(`\nCONTINUE?\n`);
    LOGGER.info(`6. The user get secret transaction with payload ${payload}.`);
    LOGGER.info("END.");
    process.exit(0);
}).catch((err) => {
    console.error(`Encounter error: ${err.stack}`);
    // throw new Error("Invocation fails with err msg: " + err.message);
});