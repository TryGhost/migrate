import {BaseImporter} from './Importer.js';

export function createNoopImporter<T extends {id: string}>(): BaseImporter<T> {
    return {
        async recreate(item: T) {
            return item.id;
        },
        async recreateByObjectOrId(idOrItem: string | T) {
            if (typeof idOrItem === 'string') {
                return idOrItem;
            } else {
                return idOrItem.id;
            }
        },
        revert() {
            return Promise.resolve();
        },
        revertByObjectOrId() {
            return Promise.resolve();
        }
    };
}
