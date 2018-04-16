/**
 * @author Aref Mirhosseini <code@arefm.me> (http://arefm.me)
 */

'use strict'

const http = require('http')
const Request = require('request')

class OneSignal {

    constructor(app_id = OneSignal.Required, api_key = OneSignal.Required) {
        this.APP_ID = app_id
        this.API = Request.defaults({
            baseUrl: 'https://onesignal.com/api/v1',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${api_key}`
            }
        })
    }

    GetDevices() {
        let defer = new Promise((resolve, reject) => {
            this.API(`/players?app_id=${this.APP_ID}`, (err, resp) => {
                if (err)
                    return reject(OneSignal.Error(err))
                resolve(OneSignal.Response(resp))
            })
        })
        return defer
    }

    GetDevice(device_id = OneSignal.Required) {
        let defer = new Promise((resolve, reject) => {
            this.API(`/players/${device_id}?app_id=${this.APP_ID}`, (err, resp) => {
                if (err)
                    return OneSignal.Error(err)
                resolve(OneSignal.Response(resp))
            })
        })
        return defer
    }

    Send(data = { title: 'OneSignal Notification', message: OneSignal.Required, data: {}, devices: [], segments: [], group: null }) {
        let defer = new Promise((resolve, reject) => {
            let body = {
                app_id: this.APP_ID,
                headings: {
                    en: data.title
                },
                contents: {
                    en: data.message
                },
                data: data.data
            }
            if (data.group && data.devices.length) {
                if (data.group.group) {
                    body.android_group = data.group.group
                    if (data.group.message) {
                        body.android_group_message = { en: data.group.message }
                    }
                }
            }
            if (typeof data.devices !== 'undefined' && data.devices.length)
                body.include_player_ids = data.devices
            if (typeof data.segments !== 'undefined' && data.segments.length)
                body.included_segments = data.segments
            this.API({
                url: '/notifications',
                method: 'POST',
                body: JSON.stringify(body)
            }, (err, resp) => {
                if (err)
                    return reject(OneSignal.Error(err))
                resolve(OneSignal.Response(resp))
            })
        })
        return defer
    }

    static OS(label = 'iOS') {
        let OSID
        switch (label.toLowerCase()) {
            case 'ios': 
                OSID = 0; break;
            case 'android': 
                OSID = 1; break;
            case 'amazon': 
                OSID = 2; break;
            case 'windowsphone-mpns': 
                OSID = 3; break;
            case 'chromeapps': 
                OSID = 4; break;
            case 'chromewebpush': 
                OSID = 5; break;
            case 'windowsphone-wns': 
                OSID = 6; break;
            case 'safari': 
                OSID = 7; break;
            case 'firefox': 
                OSID = 8; break;
            case 'macos':
                OSID = 9; break;
        }
        return OSID
    }

    static get Required() {
        throw new Error('Missing Required Information.')
    }

    static Response(resp) {
        if (resp.statusCode !== 200) {
            let err = JSON.parse(resp.body).errors[0]
            return OneSignal.Error(new Error(`${http.STATUS_CODES[resp.statusCode]}: ${err}`))
        }
        return JSON.parse(resp.body)
    }

    static Error(err) {
        return new Error(err.message)
    }

}

module.exports = OneSignal
