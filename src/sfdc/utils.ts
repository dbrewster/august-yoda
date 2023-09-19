import fs from "fs";
import path from "path";

export class Utils {
  private logger = console.log

  constructor(logger: any) {
    this.logger = logger;
  }

  log(message: string, config: Record<string, any>) {
    const date = new Date();
    const currentDay = date.getDay();
    const currentMonth = date.getMonth();
    const currentYear = date.getFullYear();
    let currentHour = date.getHours().toString();
    if (date.getHours() < 10)
      currentHour = '0' + currentHour.toString();
    let currentMinutes = date.getMinutes().toString();
    if (date.getMinutes() < 10)
      currentMinutes = '0' + currentMinutes.toString();
    let currentSeconds = date.getSeconds().toString();
    if (date.getSeconds() < 10)
      currentSeconds = '0' + currentSeconds.toString();
    const timestamp = '[' + currentHour + ':' + currentMinutes + ':' + currentSeconds + '] ';

    const logMessage = timestamp + message + '\n';
    if (config.debug)
      fs.appendFileSync(path.join(__dirname, '../files/', date.toLocaleDateString().replace(/\//g, '') + '_debug.log'), logMessage, 'utf-8');
  }

  sortByProperty(property: string) {
    return function (a: Record<string, any>, b: Record<string, any>) {
      let sortStatus = 0;
      if (a[property] < b[property]) {
        sortStatus = -1;
      } else if (a[property] > b[property]) {
        sortStatus = 1;
      }

      return sortStatus;
    };
  }

  sortByTwoProperty(prop1: string, prop2: string) {
    'use strict';
    return function (a: Record<string, any>, b: Record<string, any>) {
      if (a[prop1] === undefined) {
        return 1;
      } else if (b[prop1] === undefined) {
        return -1;
      } else if (a[prop1] === b[prop1]) {
        var sortStatus = 0;
        if (a[prop2].toString().toLowerCase() < b[prop2].toString().toLowerCase()) {
          sortStatus = -1;
        } else if (String(a[prop2]).toString().toLowerCase() > b[prop2].toString().toLowerCase()) {
          sortStatus = 1;
        }
      } else {
        if (a[prop1].toString().toLowerCase() < b[prop1].toString().toLowerCase()) {
          sortStatus = -1;
        } else {
          sortStatus = 1;
        }
      }
      return sortStatus;
    };
  }

  formatInt(number: number) {
    let str = number.toLocaleString('en-US');
    str = str.replace(/,/g, ' ');
    str = str.replace(/\./, ',');
    return str;
  }

  rmDir(dirPath: string, extension: string | null = null, removeSelf: boolean = true) {
    try {
      var files = fs.readdirSync(dirPath);
    } catch (e) /* istanbul ignore next */ {
      return false;
    }

    if (files.length > 0)
      for (let i = 0; i < files.length; i++) {
        let filePath = dirPath + '/' + files[i];
        /* istanbul ignore else */
        if (fs.statSync(filePath).isFile()) {
          if (extension !== null) {
            if (path.extname(filePath) == extension)
              fs.unlinkSync(filePath);
          } else {
            fs.unlinkSync(filePath);
          }

        } else {
          this.rmDir(filePath);
        }
      }
    /* istanbul ignore else */
    if (removeSelf)
      fs.rmdirSync(dirPath);

    return true;
  };

  capitalize(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
}
