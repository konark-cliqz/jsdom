"use strict";

exports.implementation = class NavigatorConcurrentHardwareImpl {
  get hardwareConcurrency() {
    return 1;
  }
};
