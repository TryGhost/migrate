import {ImportError} from "./ImportError.js";

export class ImportWarning extends ImportError {
    get isFatal() {
        return false;
    }
}
