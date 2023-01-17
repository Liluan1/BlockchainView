const crypto = require('crypto');
const axios = require('axios');
const queryString = require('querystring');

async function Keygen(user, attr) {
    const url = 'http://159.223.79.148/keygen.php';
    const res = await axios.post(
        url,
        queryString.stringify({ user: user, attr: attr })
    )
    console.log(res.data);
    let obj = res.data;
    if (obj.status == "success") {
        return obj.key;
    } else {
        throw new Error("cpabe keygen error: " + obj.err);
    }
}

async function Encrypt(plaintext, accessPolicy) {
    // const uuid = crypto.randomBytes(20).toString('hex');
    const url = 'http://159.223.79.148/encrypt.php';
    const encrypt = await axios.post(
        url,
        queryString.stringify({
            plain: plaintext, access_policy: accessPolicy
        })
    )
    let obj = encrypt.data;
    if (obj.status == "success") {
        return [obj.hash, obj.time];
    } else {
        throw new Error("cpabe encrypt error: " + obj.err);
    }
}

async function Decrypt(hash, key) {
    // console.log(`Post data: ${queryString.stringify({ hash, key })}`);
    const url = 'http://159.223.79.148/decrypt.php';
    const decrypt = await axios.post(
        url, queryString.stringify({ hash, key })
    )
    let obj = decrypt.data;
    if (obj.status == "success") {
        return obj.plain;
    } else {
        throw new Error(obj.err);
    }
}

function test() {
    const key = crypto.scryptSync(password, 'salt', 24);
    const iv = Buffer.alloc(16);
    crypto.randomFillSync(iv);
    let encrypted = aesEncrypt("Hello World", key, iv);
    console.log(encrypted);
    let decrypted = aesDecrypt(encrypted, key, iv);
    console.log(decrypted);

    cpabeKeygen(
        'user1', '"activeTrue" "roleUser" "depSales"'
    ).then(key => {
        // console.log(key)
        cpabeEncrypt(
            'Hello World',
            'activeTrue and (roleAdmin or roleUser) and (depSales or depMarketing)'
        ).then(uuid => {
            console.log(uuid)
            cpabeDecrypt(uuid, key).then(plain => {
                console.log(plain)
            })
        })
    }).catch(err => {
        console.log(err)
    })
}

module.exports = {
    Keygen,
    Encrypt,
    Decrypt
}