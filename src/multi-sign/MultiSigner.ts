import * as evernode from 'evernode-js-client';
import * as fs from 'fs';
import * as kp from 'ripple-keypairs';
import { SignerPrivate } from '../models';
import { JSONHelpers } from "../utils";

class MultiSigner {
    private keyPath: string;
    private signer: SignerPrivate | null = null;
    public masterAcc: any;
    public signerAcc: any;

    public constructor(masterAcc: any) {
        this.masterAcc = masterAcc;
        this.keyPath = `../${this.masterAcc.address}.key`;

        const data = JSONHelpers.readFromFile<SignerPrivate>(this.keyPath);
        if (data) {
            this.signer = data;
            this.signerAcc = new evernode.XrplAccount(this.signer.account, this.signer.secret, { xrplApi: this.masterAcc.xrplApi });
        }
    }

    /**
     * Get the signer.
     * @returns Signer info.
     */
    public getSigner(): SignerPrivate | null {
        return this.signer;
    }

    /**
     * Set the signer.
     * @param signer Signer to set.
    */
    public setSigner(signer: SignerPrivate): void {
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
    public generateSigner(): SignerPrivate {
        const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
        const keypair = kp.deriveKeypair(nodeSecret);
        return <SignerPrivate>{
            account: kp.deriveAddress(keypair.publicKey),
            secret: nodeSecret
        };
    }

    /**
     * 
     * @param tx Transaction in json 
     * @returns The signed transaction blob
     */
    public async sign(tx: any): Promise<string> {
        if (!this.signerAcc)
            throw `No signer for ${this.masterAcc.address}`;
        const signedObj = await this.signerAcc.sign(tx, true);
        return signedObj.tx_blob;
    }

    public isSignerNode(): boolean {
        return !!this.signer;
    }
}


export default MultiSigner;