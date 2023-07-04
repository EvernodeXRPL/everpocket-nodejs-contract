import * as evernode from 'evernode-js-client';
import * as fs from 'fs';
import * as kp from 'ripple-keypairs';
import { SignerKey } from '../models';
import { JSONHelpers } from "../utils";

class MultiSigner {
    private keyPath: string;
    private signer: SignerKey | null = null;
    public masterAcc: any;
    public signerAcc: any;

    public constructor(masterAcc: any) {
        this.masterAcc = masterAcc;
        this.keyPath = `../${this.masterAcc.address}.key`;

        const data = JSONHelpers.readFromFile<SignerKey>(this.keyPath);
        if (data) {
            this.signer = data;
            this.signerAcc = new evernode.XrplAccount(this.signer.account, this.signer.secret, { xrplApi: this.masterAcc.xrplApi });
        }
    }

    /**
     * Get the signer.
     * @returns Signer info.
     */
    public getSigner(): SignerKey | null {
        return this.signer;
    }

    /**
     * Set the signer.
     * @param signer Signer to set.
    */
    public setSigner(signer: SignerKey): void {
        this.signer = signer;
        this.signerAcc = new evernode.XrplAccount(this.signer.account, this.signer.secret, { xrplApi: this.masterAcc.xrplApi });
        JSONHelpers.writeToFile(this.keyPath, this.signer);
    }

    /**
     * Remove the signer.
    */
    public removeSigner(): void {
        this.signer = null;
        this.signerAcc = null;
        fs.rmSync(this.keyPath);
    }

    /**
     * Generate a key for the node and save the node key in a file named by (../\<master address\>.key).
     * @returns Generated signer info.
     */
    public generateSigner(): SignerKey {
        const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
        const keypair = kp.deriveKeypair(nodeSecret);
        return <SignerKey>{
            account: kp.deriveAddress(keypair.publicKey),
            secret: nodeSecret
        };
    }

    /**
     * 
     * @param tx Transaction in json.
     * @returns The signed transaction blob.
     */
    public async sign(tx: any): Promise<string> {
        if (!this.signerAcc)
            throw `No signer for ${this.masterAcc.address}`;
        const signedObj = await this.signerAcc.sign(tx, true);
        return signedObj.tx_blob;
    }

    /**
     * Check wether this is a signer.
     * @returns true or false based on signer or not.
     */
    public isSignerNode(): boolean {
        return !!this.signer;
    }
}


export default MultiSigner;