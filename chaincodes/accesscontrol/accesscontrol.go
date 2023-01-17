/*
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// AccessControl provides functions for managing a car
type AccessControl struct {
	contractapi.Contract
}

func (t *AccessControl) AppendCipher(ctx contractapi.TransactionContextInterface, txID, cpabeCipher string) error {
	return ctx.GetStub().PutState(txID, []byte(cpabeCipher))
}

func (t *AccessControl) QueryCipher(ctx contractapi.TransactionContextInterface, txID string) (string, error) {
	stub := ctx.GetStub()
	if val, err := stub.GetState(txID); err != nil {
		return "", fmt.Errorf("fail to get value for View %s", txID)
	} else {
		return string(val), nil
	}
}

func main() {

	chaincode, err := contractapi.NewChaincode(new(AccessControl))

	if err != nil {
		fmt.Printf("Error create AccessControl chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting AccessControl chaincode: %s", err.Error())
	}
}
