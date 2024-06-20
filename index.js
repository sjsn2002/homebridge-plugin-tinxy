const axios = require('axios');

module.exports = (api) => {
  api.registerPlatform('HomebridgeTinxyPlatform', HomebridgeTinxyPlatform);
};

class HomebridgeTinxyPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessoriesList = [];

    if (!this.config.apiToken) {
      this.log.error('API Token not provided.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.log('Homebridge Tinxy Platform finished launching');
      this.discoverDevices();
    });
  }

  async discoverDevices() {
    try {
      const response = await axios.get(this.config.apiBaseUrl, {
        headers: { 'Authorization': `Bearer ${this.config.apiToken}` }
      });

      const devices = response.data;
      this.log(`Received devices: ${JSON.stringify(devices)}`);

      devices.forEach(device => {
        const accessory = new TinxyAccessory(this.log, device, this.api, this.config.apiToken);
        const platformAccessories = accessory.getAccessories();
        platformAccessories.forEach(platformAccessory => {
          this.accessoriesList.push(platformAccessory);
          this.api.registerPlatformAccessories('homebridge-plugin-tinxy', 'HomebridgeTinxyPlatform', [platformAccessory]);
        });
      });

      this.log(`Discovered ${devices.length} devices.`);
    } catch (error) {
      this.log('Failed to discover devices:', error);
    }
  }

  accessories(callback) {
    callback(this.accessoriesList);
  }
}

class TinxyAccessory {
  constructor(log, deviceConfig, api, apiToken) {
    this.log = log;
    this.deviceConfig = deviceConfig;
    this.api = api;
    this.apiToken = apiToken;
    this.name = deviceConfig.name;
    this.accessories = [];

    if (!deviceConfig._id) {
      this.log.error('Device ID is missing:', deviceConfig);
      return;
    }

    // Create an accessory for each switch in the device
    if (deviceConfig.devices && deviceConfig.devices.length > 0) {
      deviceConfig.devices.forEach((switchName, index) => {
        const switchAccessory = new this.api.platformAccessory(`${this.name} - ${switchName}`, this.api.hap.uuid.generate(`${deviceConfig._id}-${index}`));
        const service = switchAccessory.addService(this.api.hap.Service.Switch, switchName);
        service.getCharacteristic(this.api.hap.Characteristic.On)
          .on('set', (value, callback) => this.setOn(value, callback, index));
        this.accessories.push(switchAccessory);
      });
    } else {
      const singleSwitchAccessory = new this.api.platformAccessory(this.name, this.api.hap.uuid.generate(deviceConfig._id));
      const service = singleSwitchAccessory.addService(this.api.hap.Service.Switch, this.name);
      service.getCharacteristic(this.api.hap.Characteristic.On)
        .on('set', (value, callback) => this.setOn(value, callback, 0));
      this.accessories.push(singleSwitchAccessory);
    }
  }

  getAccessories() {
    return this.accessories;
  }

  async setOn(value, callback, switchIndex) {
    try {
      const response = await axios.post(`https://backend.tinxy.in/v2/devices/${this.deviceConfig._id}/toggle`, {
        request: { state: value ? 1 : 0 },
        deviceNumber: switchIndex + 1 // Assuming deviceNumber starts at 1, adjust if necessary
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        }
      });
      this.log(`Set ${this.name} - Switch ${switchIndex + 1} to ${value ? 'on' : 'off'}`);
      callback(null);
    } catch (error) {
      this.log(`Failed to set ${this.name} - Switch ${switchIndex + 1} to ${value ? 'on' : 'off'}: ${error}`);
      callback(error);
    }
  }
}
