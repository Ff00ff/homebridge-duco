<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

# DUCO & Homebridge

This plugin integrates your DUCO Silent Connect in HomeKit. This allows you to turn on and off the ventilation via a smart switch or through an automation such as "when humidty rises above 50%" (this requires a humidity sensor).

Currently a single FanV1 accessory is created which allows you to turn the DUCO box ventilation level to HIGH. If you turn off the accessory the DUCO box ventilation level is changed to AUTO.

**The plugin only works with a single Silent Connect box. Silent Connect needs a separate communicationprint for it to be accessible in your network.**

## Off the cloud

This plugin doesn't use an API over the public internet to manage your DUCO box. Instead, it finds a DUCO box in your local network and then uses the (open) API to communicate with the box directly. **This plugin doesn't use the ModBus interface.**
