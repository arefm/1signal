/**
 * @author Aref Mirhosseini <code@arefmirhosseini.com> (http://arefmirhosseini.com)
 */

'use strict'

const debug = require('debug')('narengi-push:service')
const app = serverRequire('server')
const _ = require('lodash')
const validator = require('validator')
const request = require('request')
const ObjectID = require('mongodb').ObjectID
const async = require('async')
const configs = app.settings
const OneSignal = require('1signal')

class PushService {

    constructor(userId = '') {
        this.UserId = userId
        this.OneSig = new OneSignal(configs.notification.onesignal.app_id, configs.notification.onesignal.api_key)
    }

    Send({ type = '', title = '', body = '', extra = {} }) {
        debug('SEND PUSH', type, title, body, extra)
        let UserId = this.UserId
        if (typeof UserId === 'undefined') return
        let model = app.models.PushNotifications
        let accModel = app.models.Account
        let osTemps = {
            Android: {
                token: "n/a",
                group: {
                    group: "sameGroup",
                    message: 'You have $[notif_count] new messages'
                },
                msg: {
                    type: type,
                    title: title,
                    body: body,
                    extra: extra
                }
            },
            IOS: {
                token: "n/a",
                msg: {
                    notification: {
                        title: title,
                        body: body
                    },
                    type: type,
                    extra: extra
                }
            }
        }
        let toSend = {}

        async.waterfall([
            (cb) => {
                accModel.findOne({
                        where: {
                            enabled: true,
                            or: [
                                { id: ObjectID(UserId) },
                                { personId: ObjectID(UserId) }
                            ]
                        }
                    })
                    .then(user => cb(null, user))
                    .catch(err => cb(err))
            },
            (user, cb) => {
                if (!user) {
                    return cb('USER NOT FOUND')
                }
                debug('SEND Notification for', user)
                let query = {
                    is_active: true,
                    or: [{
                            registered_devices: {
                                elemMatch: {
                                    user_id: ObjectID(_.get(user, 'id')),
                                    status: 'active'
                                }
                            }
                        },
                        {
                            registered_devices: {
                                elemMatch: {
                                    user_id: ObjectID(_.get(user, 'personId')),
                                    status: 'active'
                                }
                            }
                        }
                    ]
                }
                debug('FINDING DEVICES BASE ON: %j', query)
                model.find({
                        where: query
                    })
                    .then(list => {
                        if (list) {
                            _.each(list, itm => {
                                toSend = osTemps[itm.device_os]
                                toSend.os = itm.device_os

                                _.each(itm.devices(), device => {
                                    if (itm.device_os === 'Android')
                                        _.set(device, 'notification_provider', 'onesignal')
                                    console.log('PUSH > DEVICE:', device)
                                    if (String(device.user_id) === String(_.get(user, 'id'))) {
                                        switch (device.notification_provider) {
                                            case 'firebase':
                                                toSend.token = device.token
                                                this.SendViaFirebase(toSend)
                                                break
                                            case 'onesignal':
                                                toSend.device_id = device.device_id
                                                if (!validator.isUUID(toSend.device_id)) {
                                                    debug('ERROR:', itm)
                                                    return cb(new Error('Device ID is not in a valid UUID format.'))
                                                }
                                                this.SendViaOnesignal(toSend)
                                                break
                                        }
                                    }
                                })
                            })
                            cb(null, 'ok')
                        } else {
                            cb('DEVICES QUERY ERROR')
                        }
                    })
                    .catch(err => cb(err))
            }
        ], (err, result) => {
            if (err) {
                debug(err)
            }
        })
    }

    SendViaFirebase({ os = 'IOS', token = '', msg = {} }) {
        let fcmUrl = 'https://fcm.googleapis.com/fcm/send'
        let fcmAuth = 'AAAAZZzrig0:APA91bGjEdzsGvC0p8BM4pHyQncp-t7dYXExwF6pe-stM9M5bNdy46b38PZwhY7uzp2SBuxIjU_tN6WwZOV81SICLbWsN_bYQssw9VmyEsKJ9KizvMbXOc_9lw88agliI6X6MDgOuXf1'
        let fsmData = {
            to: token
        }
        switch (os) {
            case 'Android':
                fsmData.data = msg
                break
            case 'IOS':
                fsmData.notification = msg.notification
                fsmData.data = _.pick(msg, ['type', 'extra'])
                break
        }
        debug('new push notification: %j', fsmData)
        let reqOpts = {
            url: fcmUrl,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${fcmAuth}`
            },
            body: JSON.stringify(fsmData)
        }

        let reqCb = function(err, response, body) {
            if (err) {
                debug('ERR-PUSH', err, typeof response === 'undefined' ? 500 : response.StatusCode)
                return;
            }
            // body = _.pick(JSON.parse(body), ['success', 'failure'])
            debug('PushSent:%d %j', response.statusCode, JSON.parse(body))
        }
        request(reqOpts, reqCb)
    }

    SendViaOnesignal({ device_id = '', msg = {}, group = {} }) {
        debug('sendig to 1signal', {
            title: msg.title,
            message: msg.body,
            data: msg,
            devices: [device_id]
        })
        this.OneSig.Send({
            title: msg.title,
            message: msg.body,
            data: msg,
            devices: [device_id],
            group: group
        })
        .then(receipts => {
            debug(receipts)
        })
        .catch(err => {
            debug(err)
        })
    }

}

module.exports = PushService
