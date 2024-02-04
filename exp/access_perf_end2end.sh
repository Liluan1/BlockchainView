#!/bin/bash

set -o nounset
# Exit on error. Append || true if you expect an error.
set -o errexit
# Exit on error inside any functions or subshells.
set -o errtrace
# Catch the error in case mysqldump fails (but gzip succeeds) in `mysqldump |gzip`
set -o pipefail
# Turn on traces, useful while debugging but commented out by default
# set -o xtrace

# IFS=$'\t\n'    # Split on newlines and tabs (but not on spaces)

# Global variables
[[ -n "${__SCRIPT_DIR+x}" ]] || readonly __SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
[[ -n "${__SCRIPT_NAME+x}" ]] || readonly __SCRIPT_NAME="$(basename -- $0)"

PEER_COUNT=2

. env.sh

SCRIPT_NAME=$(basename $0 .sh)

function network_channel_up() {
    export PEER_COUNT=${PEER_COUNT}
    pushd ${NETWORK_DIR} > /dev/null 2>&1
    ./network.sh down
    ./network.sh up
    ./network.sh createChannel -c ${CHANNEL_NAME}
    popd  > /dev/null 2>&1
    # pushd ${NETWORK_DIR}/addOrg3 > /dev/null 2>&1
    # ./addOrg3.sh up -c ${CHANNEL_NAME}
    # popd  > /dev/null 2>&1
}

function deploy_chaincode() {
    pushd ${NETWORK_DIR} > /dev/null 2>&1
    chaincode_name="$1"
    peer_count=$2
    all_org=""

    for i in $(seq ${peer_count})
    do
        all_org="$all_org 'Org${i}MSP.peer'"
    done

    function join_by { local d=$1; shift; local f=$1; shift; printf %s "$f" "${@/#/$d}"; }
    endorse_policy="OR($(join_by , $all_org))"

    ./network.sh deployCC -c ${CHANNEL_NAME} -ccl go -ccn ${chaincode_name} -ccp ../chaincodes/${chaincode_name} -ccep ${endorse_policy} -cccg ../chaincodes/${chaincode_name}/collection_config.json
    popd  > /dev/null 2>&1
}

function network_down() {
    pushd ${NETWORK_DIR} > /dev/null 2>&1
    ./network.sh down
    popd  > /dev/null 2>&1
}

function run_exp() {
    workload_file="$1"
    client_count=$2

    # network_channel_up

    workload_chaincodeID="secretcontract"
    # deploy_chaincode "secretcontract" ${PEER_COUNT}
    # deploy_chaincode "accesscontrol" ${PEER_COUNT}

    result_dir="result/$(date +%d-%m)"
    log_dir="log/$(date +%d-%m)"
    mkdir -p ${log_dir}
    mkdir -p ${result_dir}

    echo "========================================================="
    echo "Start launching ${client_count} client processes."
    for i in $(seq ${client_count}) 
    do
        log_file="${log_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${i}_${client_count}.log"
        echo "    Client ${i} log at ${log_file}"
        (timeout ${MAX_CLI_RUNNING_TIME} node access_control.js ${ORG_DIR} ${workload_file} ${CHANNEL_NAME} ${workload_chaincodeID} > ${log_file} 2>&1 ; exit 0) & # if timeout, the command returns with status code 0 instead of 124; so that the script will not exit. 
    done

    echo "Wait for at most ${MAX_CLI_RUNNING_TIME} for client processes to finish"
    wait

    aggregated_result_file="${result_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${client_count}clients"

    echo "=========================================================="
    echo "Aggregate client results " | tee ${aggregated_result_file}

    total_thruput=0
    total_batch_delay=0
    finished_cli_count=0

    for i in $(seq ${client_count}) 
    do
        # Must be identical to the above
        log_file="${log_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${i}_${client_count}.log"

        last_line="$(tail -1 ${log_file})" 
        if [[ "${last_line}" =~ ^Total* ]]; then

            IFS=' ' read -ra tokens <<< "${last_line}"
            latency=${tokens[3]} # ms units
            app_txn_count=${tokens[9]}
            committed_count=${tokens[14]}
            batch_delay=${tokens[20]}

            thruput=$((${committed_count}*1000/${latency})) # tps
            total_batch_delay=$((${total_batch_delay}+${batch_delay}))
            echo "    result_${i}: total_duration: ${latency} ms, app_txn_count: ${app_txn_count}, committed_count: ${committed_count} thruput: ${thruput} avg batch delay: ${batch_delay}" | tee -a ${aggregated_result_file} 
            total_thruput=$((${total_thruput}+${thruput}))
            finished_cli_count=$((${finished_cli_count}+1))

        else
            echo "    Client ${i} does not finish within ${MAX_CLI_RUNNING_TIME}. " | tee -a ${aggregated_result_file} 
        fi
    done

    if (( ${finished_cli_count} == 0 )); then
        echo "No clients finish in time. "
    else
        avg_batch_delay=$((${total_batch_delay}/${finished_cli_count}))
        echo "Total Thruput(tps): ${total_thruput} tps, Batch Delay(ms): ${avg_batch_delay} , # of Finished Client: ${finished_cli_count} " | tee -a ${aggregated_result_file}
    fi
    echo "=========================================================="

    # network_down
}

function perf_test() {
    workload_file="$1"
    client_count=$2

    workload_chaincodeID="secretcontract"
    result_dir="result/$(date +%d-%m)"
    log_dir="log/$(date +%d-%m)"
    mkdir -p ${log_dir}
    mkdir -p ${result_dir}

    echo "========================================================="
    echo "Start launching ${client_count} client processes."
    for i in $(seq ${client_count}) 
    do
        log_file="${log_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${i}_${client_count}.log"
        echo "    Client ${i} log at ${log_file}"
        (timeout ${MAX_CLI_RUNNING_TIME} node access_control.js ${ORG_DIR} ${workload_file} ${CHANNEL_NAME} ${workload_chaincodeID} > ${log_file} 2>&1 ; exit 0) & # if timeout, the command returns with status code 0 instead of 124; so that the script will not exit. 
    done

    echo "Wait for at most ${MAX_CLI_RUNNING_TIME} for client processes to finish"
    wait

    aggregated_result_file="${result_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${client_count}clients"

    echo "=========================================================="
    echo "Aggregate client results " | tee ${aggregated_result_file}

    total_thruput=0
    total_batch_delay=0
    finished_cli_count=0

    for i in $(seq ${client_count}) 
    do
        # Must be identical to the above
        log_file="${log_dir}/${SCRIPT_NAME}_$(basename ${workload_file} .json)_${i}_${client_count}.log"

        last_line="$(tail -1 ${log_file})" 
        if [[ "${last_line}" =~ ^Total* ]]; then

            IFS=' ' read -ra tokens <<< "${last_line}"
            latency=${tokens[3]} # ms units
            app_txn_count=${tokens[9]}
            committed_count=${tokens[14]}
            batch_delay=${tokens[20]}

            thruput=$((${committed_count}*1000/${latency})) # tps
            total_batch_delay=$((${total_batch_delay}+${batch_delay}))
            echo "    result_${i}: total_duration: ${latency} ms, app_txn_count: ${app_txn_count}, committed_count: ${committed_count} thruput: ${thruput} avg batch delay: ${batch_delay}" | tee -a ${aggregated_result_file} 
            total_thruput=$((${total_thruput}+${thruput}))
            finished_cli_count=$((${finished_cli_count}+1))

        else
            echo "    Client ${i} does not finish within ${MAX_CLI_RUNNING_TIME}. " | tee -a ${aggregated_result_file} 
        fi
    done

    if (( ${finished_cli_count} == 0 )); then
        echo "No clients finish in time. "
    else
        avg_batch_delay=$((${total_batch_delay}/${finished_cli_count}))
        echo "Total Thruput(tps): ${total_thruput} tps, Batch Delay(ms): ${avg_batch_delay} , # of Finished Client: ${finished_cli_count} " | tee -a ${aggregated_result_file}
    fi
    echo "=========================================================="
}

# The main function
main() {
    # if [[ $# < 2 ]]; then 
    #    echo "Insufficient arguments, expecting at least 2, actually $#" >&2 
    #    echo "    Usage: perf_end2end.sh [workload_path] [client_count]" >&2 
    #    exit 1
    # fi
    pushd ${__SCRIPT_DIR} > /dev/null 2>&1

    # workload_file="$1"
    # client_count=$2
    network_channel_up
    deploy_chaincode "secretcontract" ${PEER_COUNT}
    deploy_chaincode "accesscontrol" ${PEER_COUNT}
    for workload_file in $(ls workload/access_control_*batch_*size.json); do
        for client_count in 2; do
            run_exp ${workload_file} ${client_count}
            # perf_test ${workload_file} ${client_count}
            echo "Sleep for 10s before the next experiment"
            sleep 10s
        done
    done
    network_down
    popd > /dev/null 2>&1
}

main "$@"

# exit normally except being sourced.
[[ "$0" != "${BASH_SOURCE[0]}" ]] || exit 0