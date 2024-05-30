import axios from 'axios';
import fs from 'fs';

async function customConsole ( message, ...args ) {
    console.log( `[MYST] ${ message }`, ...args );
}

class Myst {
    constructor ( uri ) {
        this.uri = uri;
        this.proposals = [];
        this.forbidden_proposals = [];
        this.consumer_id = '';
        this.max_retries = 10;
    }


    async updateProposals () {
        try {
            let config = {
                method: 'get',
                maxBodyLength: Infinity,
                // url: `${ this.uri }/proposals`,
                url: `https://discovery.mysterium.network/api/v4/proposals`,
                headers: {}
            };

            const response = await axios.request( config );
            const data = JSON.parse( JSON.stringify( response.data ) );
            this.proposals = data/*.proposals*/;

            fs.writeFileSync( './proposals.json', JSON.stringify( this.proposals, null, 2 ) );

            customConsole( "Proposals updated length: ", this.proposals.length );
        } catch ( error ) {
            console.log( error );
            customConsole( "updateProposals", error.message );
            throw new Error( 'Failed to fetch proposals' );
        }
    }

    async getConsumerId () { // for this shit for one time u need to connect via UI tbh i am too lazy to find more effincy way
        try {
            let config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `${ this.uri }/connection`,
                headers: {}
            };

            const response = await axios.request( config );
            const data = JSON.parse( JSON.stringify( response.data ) );
            this.consumer_id = data.consumer_id;

            // assert throw if consumer id null

            if ( !this.consumer_id )
                throw new Error( 'consumer id is null, first connect vpn and disconnect' );

            customConsole( "Got consumer ID: ", this.consumer_id );
        } catch ( error ) {
            customConsole( "getConsumerId", error.message );
            throw new Error( 'Failed to fetch consumer id' );
        }
    }

    async getConnectionStatus () {
        try {
            let config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `${ this.uri }/connection`,
                headers: {}
            };

            const response = await axios.request( config );
            const data = JSON.parse( JSON.stringify( response.data ) );

            return data.status;
        } catch ( error ) {
            throw new Error( 'Failed to fetch connection status' );
        }
    }

    async getRandomProposal () {
        if ( this.proposals.length === 0 )
            throw new Error( 'No proposals available' );

        const randomIndex = Math.floor( Math.random() * this.proposals.length );
        const data = this.proposals[ randomIndex ];
        customConsole( "Random proposal: ", data.provider_id );
        if ( await this.checkProvider( data.provider_id ) )
            return await this.getRandomProposal();

        await this.appendProvider( data.provider_id );
        return data;
    }

    async connectProposal ( proposal, retry = 0 ) {
        customConsole( "[%d] Connecting to proposal: ", retry, proposal.provider_id );

        if ( retry > this.max_retries || !proposal )
            throw new Error( 'Max retries reached' );

        const status = await this.getConnectionStatus();
        customConsole( "Current connection status: ", status );
        if ( status === 'Connected' ) {
            customConsole( "Already connected, stopping connection" );
            await this.stopConnection();
        }

        let config = {
            method: 'PUT',
            maxBodyLength: Infinity,
            url: `${ this.uri }/connection`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: {
                consumer_id: this.consumer_id,
                proposal_id: proposal.provider_id
            }
        };

        const response = await axios.request( config ).catch( error => {
            return error.response;
        } );

        const data = JSON.parse( JSON.stringify( response.data ) );

        if ( data?.error?.code == 'err_connect' ) {
            customConsole( "Forbidden to connect: ", proposal.provider_id );
            return await this.connectProposal( await this.getRandomProposal(), retry + 1 );
        }

        if ( data?.error?.code == 'err_connection_already_exists' ) {
            customConsole( "Connection already exists: ", proposal.provider_id );
            await this.stopConnection();
            return await this.connectProposal( await this.getRandomProposal(), retry + 1 );
        }

        if ( data.status !== 'Connected' )
            throw new Error( 'Failed to connect proposal, Status : ' + data.status );

        customConsole( "Connected to proposal: ", proposal.provider_id );

        return data;
    }

    async stopConnection () {
        try {
            let config = {
                method: 'DELETE',
                maxBodyLength: Infinity,
                url: `${ this.uri }/connection`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: {
                    consumer_id: this.consumer_id
                }
            };

            const response = await axios.request( config );
            const status = response.status;
            if ( status !== 202 )
                throw new Error( 'Failed to disconnect' );
        } catch ( error ) {
            customConsole( "stopConnection", error.message );
        }
    }

    async getConnectedIP () {
        try {
            let config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `${ this.uri }/connection/proxy/ip`,
                headers: {}
            };

            const response = await axios.request( config );
            return response.data.ip;
        } catch ( error ) {
            customConsole( "getConnectedIP", error.message );
            throw new Error( 'Failed to fetch connected IP' );
        }
    }

    async checkIP ( ip ) {
        const file = `./ip.txt`;

        if ( !fs.existsSync( file ) ) {
            fs.writeFileSync( file, '' );
        }

        const lines = fs.readFileSync( file, 'utf-8' ).split( '\n' );
        return lines.includes( ip );
    }

    async appendIP ( ip ) {
        const file = `./ip.txt`;
        fs.appendFileSync( file, `${ ip }\n` );
    }



    async checkProvider ( provider ) {
        const file = `./provider.txt`;

        if ( !fs.existsSync( file ) ) {
            fs.writeFileSync( file, '' );
        }

        const lines = fs.readFileSync( file, 'utf-8' ).split( '\n' );
        return lines.includes( provider );
    }

    async appendProvider ( provider ) {
        const file = `./provider.txt`;
        fs.appendFileSync( file, `${ provider }\n` );
    }


    async controlIP () {
        const ip = await this.getConnectedIP();
        customConsole( "Connected IP: ", ip );

        if ( !await this.checkIP( ip ) ) {
            await this.appendIP( ip );
            return true;
        } else {
            customConsole( "IP already exists: ", ip );
            return false;
        }
    }
};

export default Myst;

// ( async () => {
//     const myst = new Myst( 'http://localhost:44050' );
//     await myst.getConsumerId(); // get consumer id
//     await myst.updateProposals(); // get proposals ( use this shit for one time when the code launched )
//     const proposal = await myst.getRandomProposal();
//     await myst.connectProposal( proposal ); // auto connect, disconnect no need to check it
//     const resp = await myst.controlIP(); // tbh i am creating game accounts i need 1 ip 1 account that's why i have command like this.
//     if ( resp ) {
//         await myst.stopConnection();
//         customConsole( "After Ip: ", await myst.getConnectedIP() );
//     }
//     else
//         throw new Error( `We got same ip.` );
// } )();
