class JSONHelpers {
    public static castToModel<T>(obj: any, ignore: any[] = []): T {
        let returnObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const ccKey = key.replace(/_([a-z])/g, function (g) { return g[1].toUpperCase(); });
            returnObj[ccKey] = (typeof value === 'object' && !Array.isArray(value) && !ignore.includes(key)) ?
                this.castToModel<any>(value) : value;
        }
        return returnObj as T;
    }

    public static castFromModel(obj: any, ignore: any[] = []): any {
        let returnObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            const uKey = key.replace(/([A-Z])/g, function (g) { return `_${g[0].toLocaleLowerCase()}`; });
            returnObj[uKey] = (typeof value === 'object' && !Array.isArray(value) && !ignore.includes(key)) ?
                this.castFromModel(value) : value;
        }
        return returnObj;
    }
}

export default JSONHelpers;