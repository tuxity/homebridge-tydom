import assert from 'assert';
import {
  Characteristic,
  CharacteristicEventTypes,
  CharacteristicProps,
  CharacteristicSetCallback,
  CharacteristicValue,
  NodeCallback,
  Service
} from 'hap-nodejs';
import TydomController from 'src/controller';
import {PlatformAccessory} from 'src/typings/homebridge';
import {TydomDeviceThermostatData} from 'src/typings/tydom';
import {
  addAccessoryService,
  setupAccessoryIdentifyHandler,
  setupAccessoryInformationService
} from 'src/utils/accessory';
import {debugGet, debugSet} from 'src/utils/debug';
import {getTydomDeviceData} from 'src/utils/tydom';

export const setupThermostat = (accessory: PlatformAccessory, controller: TydomController): void => {
  const {UUID: id, context} = accessory;
  const {client} = controller;

  const {deviceId, endpointId} = context;
  setupAccessoryInformationService(accessory, controller);
  setupAccessoryIdentifyHandler(accessory, controller);

  // Add the actual accessory Service
  const service = addAccessoryService(accessory, Service.Thermostat, `${accessory.displayName}`, true);
  const {TargetHeatingCoolingState, CurrentHeatingCoolingState, TargetTemperature, CurrentTemperature} = Characteristic;

  service
    .getCharacteristic(CurrentHeatingCoolingState)!
    // @ts-ignore
    .setProps({validValues: [0, 1]} as Partial<CharacteristicProps>) // [OFF, HEAT, COOL]
    .on(CharacteristicEventTypes.GET, async (callback: NodeCallback<CharacteristicValue>) => {
      debugGet('CurrentHeatingCoolingState', {name, id});
      try {
        const data = (await getTydomDeviceData(client, {deviceId, endpointId})) as TydomDeviceThermostatData;
        // const hvacMode = data.find(prop => prop.name === 'hvacMode');
        const authorization = data.find(prop => prop.name === 'authorization')!.value;
        const setpoint = data.find(prop => prop.name === 'setpoint')!.value;
        const temperature = data.find(prop => prop.name === 'temperature')!.value;
        callback(
          null,
          authorization === 'HEATING' && setpoint > temperature
            ? CurrentHeatingCoolingState.HEAT
            : CurrentHeatingCoolingState.OFF
        );
      } catch (err) {
        callback(err);
      }
    });

  service
    .getCharacteristic(TargetHeatingCoolingState)!
    // @ts-ignore
    .setProps({validValues: [0, 1]} as Partial<CharacteristicProps>) // [OFF, HEAT, COOL, AUTO]
    .on(CharacteristicEventTypes.GET, async (callback: NodeCallback<CharacteristicValue>) => {
      debugGet('TargetHeatingCoolingState', {name, id});
      try {
        const data = (await getTydomDeviceData(client, {deviceId, endpointId})) as TydomDeviceThermostatData;
        const hvacMode = data.find(prop => prop.name === 'hvacMode')!.value; // NORMAL | STOP | ANTI_FROST
        const authorization = data.find(prop => prop.name === 'authorization')!.value; // STOP | HEATING
        callback(
          null,
          authorization === 'HEATING' && hvacMode === 'NORMAL'
            ? TargetHeatingCoolingState.HEAT
            : TargetHeatingCoolingState.OFF
        );
      } catch (err) {
        callback(err);
      }
    })
    .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      debugSet('TargetHeatingCoolingState', {name, id, value});
      const tydomValue = [TargetHeatingCoolingState.HEAT, TargetHeatingCoolingState.AUTO].includes(value as number)
        ? 'NORMAL'
        : 'STOP';
      await client.put(`/devices/${deviceId}/endpoints/${endpointId}/data`, [
        {
          name: 'hvacMode',
          value: tydomValue
        }
      ]);
      callback();
    });

  service
    .getCharacteristic(TargetTemperature)!
    .on(CharacteristicEventTypes.GET, async (callback: NodeCallback<CharacteristicValue>) => {
      debugGet('TargetTemperature', {name, id});
      try {
        const data = (await getTydomDeviceData(client, {deviceId, endpointId})) as TydomDeviceThermostatData;
        const setpoint = data.find(prop => prop.name === 'setpoint');
        assert(setpoint, 'Missing `setpoint` data item');
        callback(null, setpoint!.value);
      } catch (err) {
        callback(err);
      }
    })
    .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
      debugSet('TargetTemperature', {name, id, value});
      await client.put(`/devices/${deviceId}/endpoints/${endpointId}/data`, [
        {
          name: 'setpoint',
          value: value
        }
      ]);
      callback();
    });

  service
    .getCharacteristic(CurrentTemperature)!
    .on(CharacteristicEventTypes.GET, async (callback: NodeCallback<CharacteristicValue>) => {
      debugGet('CurrentTemperature', {name, id});
      try {
        const data = (await getTydomDeviceData(client, {deviceId, endpointId})) as TydomDeviceThermostatData;
        const temperature = data.find(prop => prop.name === 'temperature');
        assert(temperature, 'Missing `temperature` data item');
        callback(null, temperature!.value);
      } catch (err) {
        callback(err);
      }
    });
};

export const updateThermostat = (accessory: PlatformAccessory, updates: Record<string, unknown>[]) => {
  const {CurrentTemperature, TargetTemperature} = Characteristic;
  updates.forEach(update => {
    const {name} = update;
    switch (name) {
      case 'setpoint': {
        const service = accessory.getService(Service.Thermostat);
        assert(service, `Unexpected missing service "${Service.Thermostat} in accessory`);
        service.getCharacteristic(TargetTemperature)!.updateValue(update!.value as number);
        return;
      }
      case 'temperature': {
        const service = accessory.getService(Service.Thermostat);
        assert(service, `Unexpected missing service "${Service.Thermostat} in accessory`);
        service.getCharacteristic(CurrentTemperature)!.updateValue(update!.value as number);
        return;
      }
      default:
        return;
    }
  });
};

/*
  {
    "id": 1537640941,
    "endpoints": [
      {
        "id": 1537640941,
        "error": 0,
        "data": [
          {"name": "authorization", "validity": "expired", "value": "HEATING"},
          {"name": "setpoint", "validity": "expired", "value": 18.5},
          {"name": "thermicLevel", "validity": "expired", "value": null},
          {"name": "hvacMode", "validity": "expired", "value": "NORMAL"},
          {"name": "timeDelay", "validity": "expired", "value": 0},
          {"name": "temperature", "validity": "expired", "value": 19.44},
          {"name": "tempoOn", "validity": "expired", "value": false},
          {"name": "antifrostOn", "validity": "expired", "value": false},
          {"name": "loadSheddingOn", "validity": "expired", "value": false},
          {"name": "openingDetected", "validity": "expired", "value": false},
          {"name": "presenceDetected", "validity": "expired", "value": false},
          {"name": "absence", "validity": "expired", "value": false},
          {"name": "productionDefect", "validity": "expired", "value": false},
          {"name": "batteryCmdDefect", "validity": "expired", "value": false},
          {"name": "tempSensorDefect", "validity": "expired", "value": false},
          {"name": "tempSensorShortCut", "validity": "expired", "value": false},
          {"name": "tempSensorOpenCirc", "validity": "expired", "value": false},
          {"name": "boostOn", "validity": "expired", "value": false}
        ]
      }
    ]
  }
*/

/*
  {
    "id": 1537640941,
    "endpoints": [
      {
        "id": 1537640941,
        "error": 0,
        "metadata": [
          {"name": "authorization", "type": "string", "permission": "rw", "enum_values": ["STOP", "HEATING"]},
          {
            "name": "setpoint",
            "type": "numeric",
            "permission": "rw",
            "min": 10.0,
            "max": 30.0,
            "step": 0.5,
            "unit": "degC"
          },
          {"name": "thermicLevel", "type": "string", "permission": "rw", "enum_values": ["STOP"]},
          {
            "name": "delaySetpoint",
            "type": "numeric",
            "permission": "w",
            "min": 10.0,
            "max": 30.0,
            "step": 0.5,
            "unit": "degC"
          },
          {"name": "delayThermicLevel", "type": "string", "permission": "w", "enum_values": ["STOP"]},
          {"name": "hvacMode", "type": "string", "permission": "rw", "enum_values": ["NORMAL", "STOP", "ANTI_FROST"]},
          {
            "name": "timeDelay",
            "type": "numeric",
            "permission": "rw",
            "min": 0,
            "max": 65535,
            "step": 1,
            "unit": "minute"
          },
          {
            "name": "temperature",
            "type": "numeric",
            "permission": "r",
            "min": -99.9,
            "max": 99.9,
            "step": 0.01,
            "unit": "degC"
          },
          {"name": "tempoOn", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "antifrostOn", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "loadSheddingOn", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "openingDetected", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "presenceDetected", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "absence", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "productionDefect", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "batteryCmdDefect", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "tempSensorDefect", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "tempSensorShortCut", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "tempSensorOpenCirc", "type": "boolean", "permission": "r", "unit": "boolean"},
          {"name": "boostOn", "type": "boolean", "permission": "rw", "unit": "boolean"},
          {"name": "localisation", "type": "string", "permission": "w", "enum_values": ["START"]},
          {"name": "modeAsso", "type": "string", "permission": "w", "enum_values": ["START"]}
        ]
      }
    ]
  }
  */
