const axios = require('axios');

module.exports = (api) => {
  api.registerPlatform('HomebridgeTinxy', HomebridgeTinxy);
};

class HomebridgeTinxy {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessoriesList = [];
    this.cachedAccessories = new Map();
    this.debug = config.debug || false;

    if (!this.config.apiToken) {
      this.log.error('API Token not provided.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.log('Homebridge Tinxy Platform finished launching');
      this.discoverDevices();
      this.startStatusUpdates();
    });
  }

  configureAccessory(accessory) {
    if (this.debug) this.log(`Configuring cached accessory: ${accessory.displayName}`);
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    try {
      const response = await axios.get(this.config.apiBaseUrl, {
        headers: { 'Authorization': `Bearer ${this.config.apiToken}` }
      });

      const devices = response.data;

      if (this.debug) this.log(`Received devices: ${JSON.stringify(devices)}`);

      devices.forEach(device => {
        const accessory = new TinxyAccessory(this.log, device, this.api, this.config.apiToken, this.cachedAccessories, this.debug);
        const platformAccessories = accessory.getAccessories();
        platformAccessories.forEach(platformAccessory => {
          if (this.cachedAccessories.has(platformAccessory.UUID)) {
            this.api.updatePlatformAccessories([platformAccessory]);
          } else {
            this.accessoriesList.push(platformAccessory);
            this.api.registerPlatformAccessories('homebridge-plugin-tinxy', 'HomebridgeTinxy', [platformAccessory]);
          }
        });
      });

      if (this.debug) this.log(`Discovered ${devices.length} devices.`);
    } catch (error) {
      this.log('Failed to discover devices:', error);
    }
  }

  accessories(callback) {
    callback(Array.from(this.cachedAccessories.values()));
  }

  startStatusUpdates() {
    setInterval(() => {
      this.cachedAccessories.forEach(accessory => {
        const service = accessory.getService(this.api.hap.Service.Switch);
        if (service) {
          service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(service.getCharacteristic(this.api.hap.Characteristic.On).value);
        }
      });
    }, 10000); // 10 seconds
  }
}

class TinxyAccessory {
  constructor(log, deviceConfig, api, apiToken, cachedAccessories, debug) {
    this.log = log;
    this.deviceConfig = deviceConfig;
    this.api = api;
    this.apiToken = apiToken;
    this.name = deviceConfig.name;
    this.accessories = [];
    this.cachedAccessories = cachedAccessories;
    this.debug = debug;

    if (!deviceConfig._id) {
      this.log.error('Device ID is missing:', deviceConfig);
      return;
    }

    this.createAccessory();
  }

  createAccessory() {
    const uuid = this.api.hap.uuid.generate(this.deviceConfig._id);
    const accessory = this.cachedAccessories.get(uuid) || new this.api.platformAccessory(this.name, uuid);
    let service;

    if (this.deviceConfig.deviceTypes.includes('Fan')) {
      service = accessory.getService(this.api.hap.Service.Fanv2) || accessory.addService(this.api.hap.Service.Fanv2, this.name);

      service.getCharacteristic(this.api.hap.Characteristic.Active)
        .onGet(this.handleActiveGet.bind(this))
        .onSet(this.handleActiveSet.bind(this));
    } else if (this.deviceConfig.deviceTypes.some(type => ['Light', 'Bulb', 'LED Bulb'].includes(type))) {
      service = accessory.getService(this.api.hap.Service.Lightbulb) || accessory.addService(this.api.hap.Service.Lightbulb, this.name);

      service.getCharacteristic(this.api.hap.Characteristic.On)
        .onGet(this.handleOnGet.bind(this))
        .onSet(this.handleOnSet.bind(this));
    } else if (this.deviceConfig.deviceTypes.includes('Socket')) {
      service = accessory.getService(this.api.hap.Service.Outlet) || accessory.addService(this.api.hap.Service.Outlet, this.name);

      service.getCharacteristic(this.api.hap.Characteristic.On)
        .onGet(this.handleOnGet.bind(this))
        .onSet(this.handleOnSet.bind(this));
    } else {
      service = accessory.getService(this.api.hap.Service.Switch) || accessory.addService(this.api.hap.Service.Switch, this.name);

      service.getCharacteristic(this.api.hap.Characteristic.On)
        .onGet(this.handleOnGet.bind(this))
        .onSet(this.handleOnSet.bind(this));
    }

    this.accessories.push(accessory);
  }

  getAccessories() {
    return this.accessories;
  }

  async handleActiveGet() {
    this.log.debug('Triggered GET Active');

    try {
      const response = await axios.get(`https://ha-backend.tinxy.in/v2/devices/${this.deviceConfig._id}/state`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        }
      });
      const state = response.data.state.toLowerCase() === 'on' ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE;
      return state;
    } catch (error) {
      this.log.error(`Failed to get status of ${this.name}: ${error}`);
      return this.api.hap.Characteristic.Active.INACTIVE;
    }
  }

  async handleActiveSet(value) {
    this.log.debug('Triggered SET Active:', value);

    try {
      await axios.post(`https://ha-backend.tinxy.in/v2/devices/${this.deviceConfig._id}/toggle`, {
        request: { state: value === this.api.hap.Characteristic.Active.ACTIVE ? 1 : 0 }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        }
      });
      this.log.debug(`Set ${this.name} to ${value === this.api.hap.Characteristic.Active.ACTIVE ? 'active' : 'inactive'}`);
    } catch (error) {
      this.log.error(`Failed to set ${this.name} to ${value === this.api.hap.Characteristic.Active.ACTIVE ? 'active' : 'inactive'}: ${error}`);
    }
  }

  async handleOnGet() {
    this.log.debug('Triggered GET On');

    try {
      const response = await axios.get(`https://ha-backend.tinxy.in/v2/devices/${this.deviceConfig._id}/state`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        }
      });
      const state = response.data.state.toLowerCase() === 'on';
      return state;
    } catch (error) {
      this.log.error(`Failed to get status of ${this.name}: ${error}`);
      return false;
    }
  }

  async handleOnSet(value) {
    this.log.debug('Triggered SET On:', value);

    try {
      await axios.post(`https://ha-backend.tinxy.in/v2/devices/${this.deviceConfig._id}/toggle`, {
        request: { state: value ? 1 : 0 }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        }
      });
      this.log.debug(`Set ${this.name} to ${value ? 'on' : 'off'}`);
    } catch (error) {
      this.log.error(`Failed to set ${this.name} to ${value ? 'on' : 'off'}: ${error}`);
    }
  }
}
