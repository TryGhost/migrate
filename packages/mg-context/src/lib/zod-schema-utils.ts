import {z} from 'zod/v4';

export type FieldInfo = {
    type: string;
    required: boolean;
    maxLength?: number;
    choices?: string[];
    defaultValue: any;
    hasDefault: boolean;
};

function unwrap(schema: any): {inner: any; nullable: boolean; defaultValue: any; hasDefault: boolean} {
    let nullable = false;
    let hasDefault = false;
    let defaultValue: any;
    let current = schema;

    const wrapperTypes = new Set(['nullable', 'default', 'optional']);
    while (wrapperTypes.has(current._zod.def.type)) {
        const type = current._zod.def.type;
        if (type === 'nullable') {
            nullable = true;
            current = current._zod.def.innerType;
        } else if (type === 'default') {
            hasDefault = true;
            defaultValue = current._zod.def.defaultValue;
            current = current._zod.def.innerType;
        } else if (type === 'optional') {
            nullable = true;
            current = current._zod.def.innerType;
        }
    }

    return {inner: current, nullable, defaultValue, hasDefault};
}

function getMaxLength(schema: any): number | undefined {
    const checks: any[] = schema._zod.def.checks ?? [];
    for (const check of checks) {
        if (check._zod.def.check === 'max_length') {
            return check._zod.def.maximum;
        }
    }
    return undefined;
}

function mapType(defType: string): string {
    switch (defType) {
    case 'string':
        return 'string';
    case 'boolean':
        return 'boolean';
    case 'date':
        return 'dateTime';
    case 'array':
        return 'array';
    case 'enum':
        return 'string';
    default:
        return defType;
    }
}

export function getFieldInfo(fieldSchema: z.ZodType): FieldInfo {
    const {inner, nullable, defaultValue, hasDefault} = unwrap(fieldSchema);
    const defType = inner._zod.def.type as string;

    const info: FieldInfo = {
        type: mapType(defType),
        required: !nullable,
        defaultValue: hasDefault ? defaultValue : null,
        hasDefault
    };

    const maxLength = getMaxLength(inner);
    if (maxLength !== undefined) {
        info.maxLength = maxLength;
    }

    if (defType === 'enum') {
        info.choices = Object.values(inner._zod.def.entries) as string[];
    }

    return info;
}
