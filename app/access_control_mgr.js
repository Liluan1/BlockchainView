'use strict';

const FabricFront = require("./fabricfront").FabricFront;
const util = require('util');
const cmgr = require('./crypto_mgr.js');
const global = require('./global.js');
const LOGGER = require('loglevel');
const cpabe = require('./cpabe.js');
const timer = ms => new Promise(res => setTimeout(res, ms));
LOGGER.setDefaultLevel('debug')

class AccessControlMgr {
    // wl_contract_id : contract ID to for the real workload, i.e., supply chain
    // ac_contract_id : access_policy contract ID, exclusively for irrevocable. 
    constructor(fabric_front, wl_contract_id, ac_contract_id) {
        this.fabric_front = fabric_front;
        this.wl_contract_id = wl_contract_id;
        this.ac_contract_id = ac_contract_id;
        this.cpabe_cipher = {};
        this.txn_keys = {}; // associate the viewName with the view key
    }

    InvokeTxn(func_name, pub_arg, prv_arg, raw_req) {
        var key = cmgr.CreateKey();
        LOGGER.info(`\tGenerate a random key ${key} for this txn`);

        var secret_payload = cmgr.Encrypt(key, prv_arg);
        LOGGER.info(`\tUse the key to encode the private info ${prv_arg} into ${secret_payload}`);

        return this.fabric_front.InvokeTxn(this.wl_contract_id, func_name, [pub_arg, secret_payload]).then((txnID) => {
            this.txn_keys[txnID] = key;
            LOGGER.info(`\tSend a txn ${txnID} to invoke ${this.wl_contract_id} with the prv arg. `);
            return [0, txnID, raw_req];
        }).catch(error => {
            LOGGER.error(`Error with code ${error}`);
            // probably due to MVCC
            return [error.transactionCode, "", raw_req];
        });
    }

    AppendCipher(txnID, access_policy) {
        // LOGGER.info(`\tAppend cipher for txn ${txnID} with access policy ${access_policy}`);
        var key = this.txn_keys[txnID];
        if (key === undefined) {
            throw new Error(`Txn ${txnID} has not been created. `);
        }
        // var time;
        const encrypt_start = new Date();
        const cipher = "9618055430ae2239a860529df93b4ab1";
        // LOGGER.info(`\tEncrypt the key with the access policy "${access_policy}" to get the cipher ${cipher} in 10 ms.`)
        this.cpabe_cipher[txnID] = cipher;
        return timer(0).then(() => {
            return this.fabric_front.InvokeTxn(this.ac_contract_id, "AppendCipher", [txnID, cipher]);
        }).then(() => {
            const encrypt_end = new Date();
            const time = encrypt_end - encrypt_start;
            LOGGER.info(`\tEncrypt in ${time} ms.`);
            return [txnID, 10];
        }).catch((error) => {
            LOGGER.error(`Error with code ${error}`);
            return error;
        });
    }

    GetOnChainKey(txnID, userPrvKey) {
        LOGGER.info(`\tGet onchain key for txn ${txnID}`);
        return this.fabric_front.Query(this.ac_contract_id, "QueryCipher", [txnID]).then((cipher) => {
            LOGGER.info(`\tDecrypt the cipher ${cipher} with the user's private key ${userPrvKey} to get the key`);
            return cpabe.Decrypt(cipher.toString(), userPrvKey);
        }).then((key) => {
            if (this.txn_keys[txnID] == key) {
                LOGGER.info(`\tKey is the same as the one generated locally`);
            } else {
                LOGGER.info(`\tKey is different from the one generated locally`);
            }
            return txnID;
        }).catch((error) => {
            LOGGER.error(`Error with code ${error}`);
            return error;
        });
    }

    DistributeKey(txnID, access_policy) {
        var distributedData = {};
        distributedData.txnID = txnID;
        LOGGER.info(`\tDistribute key for txn ${txnID} with access policy ${access_policy}`);
        var key = this.txn_keys[txnID];
        if (key === undefined) {
            throw new Error(`Txn ${txnID} has not been created. `);
        }
        const encrypt_start = new Date();
        wait(1000)
        return cpabe.Encrypt(key, access_policy).then((result) => {
            const encrypt_end = new Date();
            const cipher = result[0];
            const time = encrypt_end - encrypt_start - result[1];
            LOGGER.info(`\tEncrypt the key with the access policy ${access_policy} to get the cipher ${cipher} in ${time} ms.`)
            distributedData.cipher = cipher;
            return [distributedData, time];
        }).catch((error) => {
            LOGGER.error(`Error with code ${error}`);
            return error;
        });
    }

    // // To be invoked at the recipient side
    OnReceive(distributedData, userPrvKey) {
        var txnID = distributedData.txnID;
        var cipher = distributedData.cipher;
        return cpabe.Decrypt(cipher, userPrvKey).then((key) => {
            var prv_field = "secretkey";
            if (this.txn_keys[txnID] == key) {
                LOGGER.info(`\tKey is the same as the one generated locally`);
            } else {
                LOGGER.info(`\tKey is different from the one generated locally`);
            }
            return this.fabric_front.GetWriteFieldFromTxnId(txnID, prv_field);
        }).then((secret) => {
            var secret_payload = cmgr.Decrypt(this.txn_keys[txnID], secret);
            return secret_payload;
        }).catch((error) => {
            LOGGER.error(`Error with code ${error}`);
            return error;
        });
    }
}

module.exports.AccessControlMgr = AccessControlMgr;