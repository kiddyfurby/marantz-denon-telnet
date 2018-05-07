/**
    @fileoverview Control marantz and Denon AVR's by telnet.
     Blablabla

    @author Mike Kronenberg <mike.kronenberg@kronenberg.org> (http://www.kronenberg.org)
    @license MIT
*/


/**
    Function called when a command is run, and data returned.
    @callback defaultCallback
    @param {Error} error NULL or Error object, if command failed
    @param {Array} data Array with returned data or NULL if command failed
 */



var telnet = require('telnet-client');



/**
    Returns an instance of MarantzDenonTelnet that can handle telnet commands to the given IP.
    @constructor
    @param {string} ip Address of the AVR.
 */
var MarantzDenonTelnet = function(ip) {
    this.connectionparams = {
        host: ip,
        port: 23,
        timeout: 200,
        sendTimeout: 1200,
        negotiationMandatory: false
    };
    this.cmdCue = [];
    this.connection = null;
};



/**
    Extract information from returned data arrays.
    @param {Array} zoneInfo for Example ['Z240', 'SVOFF', 'Z2ON', 'Z2NET', 'Z240']
    @return {Object} {PW: string, SI: string, SV: string, VL: string}
 */
MarantzDenonTelnet.prototype.parseZoneInfo = function(zoneInfo) {
    var i;
    var ret = {};

    for (i = 0; i < zoneInfo.length; i++) {
        var item = zoneInfo[i];
        var id = item.substr(0, 2);
        var payLoad = item.substr(2);
        if (item.substr(0, 1) === 'Z') {
            if (payLoad.match(/^[0-9]*$/)) {
                ret['VL'] = payLoad;
            } else if (item.substr(2).match(/(ON|OFF)/)) {
                ret['PW'] = payLoad;
            } else {
                ret['SI'] = payLoad;
            }
        } else if (id === 'MV' && payLoad.substr(0, 3) != 'MAX') {
            ret['VL'] = payLoad;
        } else if (id === 'SI') {
            ret['SI'] = payLoad;
        } else if (id === 'SV') {
            ret['SV'] = payLoad;
        }
    }
    return ret;
};



/**
    Works thru Telnet cue.
 */
MarantzDenonTelnet.prototype.sendNextTelnetCueItem = function() {
    var mdt = this;

    if (this.cmdCue.length) {
        if (!this.connection) {
            this.connection = new telnet();
            this.connection.on('connect', function() {
                mdt.sendNextTelnetCueItem();
            });
            this.connection.connect(this.connectionparams);
        } else {
            var item = this.cmdCue.shift();
            this.connection.send(item.cmd, function(error, data) {
                if (data) {
                    data = data.trim().split('\r');
                } else if (error && error.message === 'response not received') { // if the is no statechange, the AVR ist just noct responding
                    data = {};
                    error = null;
                }
                console.log('   sent: ' + item.cmd + (error ? ' error: ' + error.message : ' received: ' + JSON.stringify(data)));
                item.callback(error, data);
                mdt.sendNextTelnetCueItem();
            });
        }
    } else {
        this.connection.end();
        this.connection = null;
    }
};

/**
    Low level method to add a command to the Telnet cue.
    @param {string} cmd Telnet command
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
 */
MarantzDenonTelnet.prototype.telnet = function(cmd, callback) {
    this.cmdCue.push({'cmd': cmd, 'callback': callback});
    if (!this.connection) {
        this.sendNextTelnetCueItem();
    }
};





/**
    Send raw Telnet codes to the AVR.
    @see marantz Telnet Reference {@link http://us.marantz.com/DocumentMaster/US/Marantz_AV_SR_NR_PROTOCOL_V02.xls}
    @param {string} cmd Telnet command
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
    @example
    var mdt = new MarantzDenonTelnet('127.0.0.1');
    mdt.cmd('PW?' function(error, data) {console.log('Power is: ' + data);});
 */
MarantzDenonTelnet.prototype.cmd = function(cmd, callback) {
    this.telnet(cmd, function(error, data) {
        if (!error) {
            callback(null, data);
        } else {
            callback(error);
        }
    });
};



/**
    Get the currently selected input of a zone.
    Telnet Command examples: SI?, Z2SOURCE
    @param {defaultCallback} callback Function to be called when the command is run, and data returned. Will return one or more of: 'CD', 'SPOTIFY', 'CBL/SAT', 'DVD', 'BD', 'GAME', 'GAME2', 'AUX1',
    'MPLAY', 'USB/IPOD', 'TUNER', 'NETWORK', 'TV', 'IRADIO', 'SAT/CBL', 'DOCK',
    'IPOD', 'NET/USB', 'RHAPSODY', 'PANDORA', 'LASTFM', 'IRP', 'FAVORITES', 'SERVER'
    @param {?string} zone NULL or ZM for MAIN ZONE, Z1 ... Zn for all others
 */
MarantzDenonTelnet.prototype.getInput = function(callback, zone) {
    var mdt = this;
    var commandPrefix = (!zone || (zone == 'ZM')) ? 'SI' : zone;

    this.telnet(commandPrefix + '?', function(error, data) {
        if (!error) {
            var parsedData = mdt.parseZoneInfo(data);
            callback(null, {SI: parsedData['SI'], SV: parsedData['SV']});
        } else {
            callback(error);
        }
    });
};



/**
    Select the input of a zone.
    Telnet Command examples: SIMPLAY, Z2MPLAY, Z3CD
    @param {string} input Supported values: 'CD', 'SPOTIFY', 'CBL/SAT', 'DVD', 'BD', 'GAME', 'GAME2', 'AUX1',
    'MPLAY', 'USB/IPOD', 'TUNER', 'NETWORK', 'TV', 'IRADIO', 'SAT/CBL', 'DOCK',
    'IPOD', 'NET/USB', 'RHAPSODY', 'PANDORA', 'LASTFM', 'IRP', 'FAVORITES', 'SERVER'
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
    @param {?string} zone NULL or ZM for MAIN ZONE, Z1 ... Zn for all others
 */
MarantzDenonTelnet.prototype.setInput = function(input, callback, zone) {
    var commandPrefix = (!zone || (zone == 'ZM')) ? 'SI' : zone;

    this.telnet(commandPrefix + input, function(error, data) {
        if (!error) {
            callback(null);
        } else {
            callback(error);
        }
    });
};



/**
    Get the current mute state of a zone.
    Defaults MAIN ZONE, if no zone set.
    Telnet Command examples: SIMPLAY, Z2MPLAY, Z3CD
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
    @param {?string} zone NULL or ZM for MAIN ZONE, Z1 ... Zn for all others
 */
MarantzDenonTelnet.prototype.getMuteState = function(callback, zone) {
    var commandPrefix = (!zone || (zone == 'ZM')) ? '' : zone;

    this.telnet(commandPrefix + 'MU?', function(error, data) {
        if (!error) {
            callback(null, (data[0] == commandPrefix + 'MUON'));
        } else {
            callback(error);
        }
    });
};



/**
    Set the mute state of a zone.
    Defaults MAIN ZONE, if no zone set.
    Telnet Command examples: MUON, MUOFF, Z2MUON, Z3MUOFF
    @param {boolean} muteState TRUE for muted
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
    @param {?string} zone NULL or ZM for MAIN ZONE, Z1 ... Zn for all others
 */
MarantzDenonTelnet.prototype.setMuteState = function(muteState, callback, zone) {
    var commandPrefix = (!zone || (zone == 'ZM')) ? '' : zone;

    this.telnet(commandPrefix + 'MU' + (muteState ? 'ON' : 'OFF'), function(error, data) {
        if (!error) {
            callback(null, muteState);
        } else {
            callback(error);
        }
    });
};



/**
    Get the current power state of the AVR.
    Telnet Command examples: PW?
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
 */
MarantzDenonTelnet.prototype.getPowerState = function(callback) {
    this.telnet('PW?', function(error, data) {
        if (!error) {
            callback(null, (data[0] == 'PWON'));
        } else {
            callback("Can't connect to device: " + error, false);
        }
    });
};



/**
    Sets the power state of the AVR.
    Telnet Command examples: PWON, PWSTANDBY (threr is no PWOFF!)
    @param {boolean} powerState - TRUE to power the AVR on
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
 */
MarantzDenonTelnet.prototype.setPowerState = function(powerState, callback) {
    this.telnet('PW' + (powerState ? 'ON' : 'STANDBY'), function(error, data) {
        if (!error) {
            callback(null, powerState);
        } else {
            callback(error);
        }
    });
};



/**
    Get the current volume of a zone.
    There is no MAIN ZONE Volue, its handled by the Mastervolume (MV)
    Telnet Command examples: MV10, Z215
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
    @param {?string} zone NULL or ZM for MAIN ZONE, Z1 ... Zn for all others
 */
MarantzDenonTelnet.prototype.getVolume = function(callback, zone) {
    var mdt = this;
    var commandPrefix = (!zone || (zone == 'ZM')) ? 'MV' : zone;

    this.telnet(commandPrefix + '?', function(error, data) {
        if (!error) {
            callback(null, parseInt((mdt.parseZoneInfo(data)['VL'] + '0').substring(0, 3), 10) * 0.1);
        } else {
            callback(error);
        }
    });
};



/**
    Set the playback volume of a zone.
    There is no MAIN ZONE Volue, its handled by the Mastervolume (MV)
    Telnet Command examples: MV20, Z230, Z340
    @param {number} volume 0-100
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
    @param {?string} zone NULL or ZM for MAIN ZONE, Z1 ... Zn for all others
 */
MarantzDenonTelnet.prototype.setVolume = function(volume, callback, zone) {
    var commandPrefix = (!zone || (zone == 'ZM')) ? 'MV' : zone;
    var vol = (volume * 10).toFixed(0);  //volume fix

    if (vol < 100) {
        vol = '0' + vol;
    } else {
        vol = '' + vol;
    }
    this.telnet(commandPrefix + vol, function(error, data) {
        if (!error) {
            callback(null, volume);
        } else {
            callback(error);
        }
    });
};



/**
    Get all supported zones of the AVR.
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
*/
MarantzDenonTelnet.prototype.getZones = function(callback) {
    var mdt = this;
    var zoneIds = ['ZM', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9'];
    var zones = {};

    // get number of zones (PW? -> ["PWON","Z2ON","Z3ON"])
    var handleZoneIds = function(err, data) {
        if (data) {
            for (i = 0; i < data.length; i++) {
                zones[zoneIds[i]] = zoneIds[i];
            }
        }
        mdt.telnet('RR?', handleZoneNames);
    };

    // Try to get zone names supported by recent AVR (RR? -> ["R1MAIN ZONE ","R2ZONE2     ","R3ZONE3"])
    var handleZoneNames = function(err, data) {
        var zoneName;
        if (data) {
            for (i = 0; i < data.length; i++) {
                zoneName = data[i].trim().substr(2);
                zones[zoneIds[i]] = zoneName;
            }
        }
        callback(null, zones);                                                  // whatever happens, we finally go on
    };

    this.telnet('PW?', handleZoneIds);
};



/**
    Returns the current power state of a zone.
    Telnet Command examples: PW?, Z2?, Z3?
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
    @param {string} zone NULL or ZM for MAIN ZONE, Z1 ... Zn for all others
 */
MarantzDenonTelnet.prototype.getZonePowerState = function(callback, zone) {
    var commandPrefix = (!zone || (zone == 'ZM')) ? 'ZM' : zone;

    this.telnet(commandPrefix + '?', function(error, data) {
        if (!error) {
            callback(null, (data[0] == commandPrefix + 'ON'));
        } else {
            callback(error);
        }
    });
};



/**
    Sets the power state of a zone.
    Telnet Command examples: PWON, PWSTANDBY, Z2ON, Z3OFF
    @param {boolean} powerState TRUE to power on
    @param {defaultCallback} callback Function to be called when the command is run, and data returned
    @param {string} zone NULL or ZM for MAIN ZONE, Z1 ... Zn for all others
 */
MarantzDenonTelnet.prototype.setZonePowerState = function(powerState, callback, zone) {
    var commandPrefix = (!zone || (zone == 'ZM')) ? 'MV' : zone;

    this.telnet(commandPrefix + (powerState ? 'ON' : 'OFF'), function(error, data) {
        if (!error) {
            callback(null, powerState);
        } else {
            callback(error);
        }
    });
};



/**
    Export.
*/
module.exports = MarantzDenonTelnet;
