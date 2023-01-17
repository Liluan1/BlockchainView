import sys
import random
import json
all_json = {"transactions": []}
attributes = [
    'activeTrue', 'activeFalse', 'activeOther',
    'roleUser', 'roleAdmin', 'roleManager', 'roleEmployee', 'roleCustomer', 'roleSupplier', 'roleAuditor', 'roleOwner', 'roleGuest', 'roleOther',
    'depSales', 'depMarketing', 'depIT', 'depHR', 'depFinance', 'depOther',
    'locUS', 'locUK', 'locEU', 'locOther',
    'timeDay', 'timeNight', 'timeWeekend', 'timeWeekday', 'timeOther',
    'deviceMobile', 'deviceDesktop', 'deviceTablet', 'deviceOther',
    'ipUS', 'ipUK', 'ipEU', 'ipOther',
    'browserChrome', 'browserFirefox', 'browserSafari', 'browserIE', 'browserOther',
    'osWindows', 'osMac', 'osLinux', 'osOther',
    'appWeb', 'appMobile', 'appDesktop', 'appOther',
    'dataSensitive', 'dataNonSensitive', 'dataOther',
    'actionRead', 'actionWrite', 'actionDelete', 'actionOther',
    'resourceUser', 'resourceProduct', 'resourceOrder', 'resourceOther',
    'envDev', 'envTest', 'envProd', 'envOther'
]

relation = ['and', 'or']

# Random combine access policy
def random_combine_attributes():
    policy = ''
    attribute = ''
    attribute_set = set()

    attributes_num = random.randint(1, 5)
    while len(attribute_set) < attributes_num:
        attribute_set.add(attributes[random.randint(0, len(attributes)-1)])
    for i in range(0, attributes_num):
        attr = attribute_set.pop()
        attribute += '"' + attr + '"'
        policy += attr
        if len(attribute_set) > 0:
            attribute += ' '
            policy += ' ' + relation[random.randint(0, len(relation)-1)] + ' '
    return attribute, policy

batch_size = [5, 10, 20, 25, 50, 100]
for i in batch_size:
    batch_num = 200//i
    for j in range(batch_num):
        batch = []
        for k in range(i):
            attribute, policy = random_combine_attributes()
            batch.append({"policy": policy, "attributes": attribute})
        all_json["transactions"].append(batch)

    open(f'access_control_{batch_num}batch_{i}size.json', 'w').write(json.dumps(all_json, indent=4, sort_keys=True))

