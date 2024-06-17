# homebridge-plugin-tinxy

Homebridge plugin for Tinxy devices.

## Installation

First, install Homebridge if you haven't already:

```sh
npm install -g homebridge
```
Then, install the Homebridge Tinxy plugin:
```
npm install -g homebridge-plugin-tinxy
```
Configuration
Add the platform configuration to your Homebridge config.json file. Replace YOUR_API_TOKEN with your actual Tinxy API token.

Example Config:
```
{
  "bridge": {
    "name": "Homebridge",
    "username": "0E:6D:77:29:04:27",
    "port": 51002,
    "pin": "986-33-XXX",
    "advertiser": "bonjour-hap"
  },
  "accessories": [],
  "platforms": [
    {
      "platform": "HomebridgeTinxyPlatform",
      "name": "Tinxy",
      "apiToken": "YOUR_API_TOKEN",
      "apiBaseUrl": "https://backend.tinxy.in/v2/devices"
    }
  ]
}
```

## Configuration Fields
platform: (Required) Always set this to HomebridgeTinxyPlatform.
name: (Required) The name of your platform. Can be any string.
apiToken: (Required) Your Tinxy API token.
apiBaseUrl: (Required) The base URL for the Tinxy API. Should be https://backend.tinxy.in/v2/devices.


## Features
Automatically discover and control Tinxy devices through Homebridge.
Supports devices with multiple switches.


##Troubleshooting
Common Issues
Devices not discovered: Ensure your API token is correct and has the necessary permissions.
Switch not toggling: Check if the device ID and switch index are correctly configured.


