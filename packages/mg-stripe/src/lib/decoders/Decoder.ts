import {Data} from './Data.js';

export type Decoder<T> = {
    decode(object: Data): T;
}
