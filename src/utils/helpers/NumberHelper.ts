import { HotPocketContext } from '../../context';

class NumberHelpers {
    /**
     * Generates a random number within given limits.
     * @param hpContext HotPocket context.
     * @param [min = 0] Random number min limit.  
     * @param [max = 1000] Random number max limit.
     * @returns A random number within the limits.
     */
    public static getRandomNumber(hpContext: HotPocketContext, min: number = 0, max: number = 1000) {
        // Decide a random number to increment the life.
        // Take a number between min and max increment moments.
        const lclBasedNum = parseInt(hpContext.lclHash.substr(0, 2), 16);
        return min +
            (lclBasedNum % (max - min));
    }
}

export default NumberHelpers;
