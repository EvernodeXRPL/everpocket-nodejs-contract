class JSONHelpers {
    /**
     * Convert json object with snake_case properties to a given class instance.
     * @param obj Json object with snake_case properties.
     * @param ignore List of keys of nested objects which needed to be skipped from camelCase conversion.
     * @returns Converted class instance.
     */
    public static castToModel<T>(obj: any, ignore: any[] = []): T {
        let returnObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const ccKey = key.replace(/_([a-z])/g, function (g) { return g[1].toUpperCase(); });
            // Skip from conversion if value is an array or key is ignored.
            returnObj[ccKey] = (typeof value === 'object' && !Array.isArray(value) && !ignore.includes(key)) ?
                this.castToModel<any>(value) : value;
        }
        return returnObj as T;
    }

    /**
     * Convert class instance or json object with camelCase properties to a json object with snake_case properties.
     * @param obj Class instance or json object with camelCase properties.
     * @param ignore List of keys of nested objects which needed to be skipped from snake_case conversion.
     * @returns Converted json object with snake_case properties.
     */
    public static castFromModel(obj: any, ignore: any[] = []): any {
        let returnObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const uKey = key.replace(/([A-Z])/g, function (g) { return `_${g[0].toLocaleLowerCase()}`; });
            // Skip from conversion if value is an array or key is ignored.
            returnObj[uKey] = (typeof value === 'object' && !Array.isArray(value) && !ignore.includes(key)) ?
                this.castFromModel(value) : value;
        }
        return returnObj;
    }
}

export default JSONHelpers;