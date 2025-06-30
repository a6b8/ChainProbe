import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { MCPStdioSSEProxy } from './src/client/MCPStdioSSEProxy.mjs'
import { ServerManager } from './src/helpers/ServerManager.mjs'
import { ClientExact } from 'x402-core'


async function getPaymentHeader( originalRequest, response ) {
    if( !response || typeof response !== 'object' || !Array.isArray( response.accepts ) ) {
        console.warn( '[x402] Missing "accepts" field in response, skipping payment header generation' )

        return null
    }

    const paymentRequirementsPayload = response

    const { paymentOption } = ClientExact
        .selectMatchingPaymentOption( { paymentRequirementsPayload, allowedPaymentOptions, chainId } )

    const { scheme, network } = paymentOption

    const { authorization, signature } = await clientExact
        .createAuthorization( { paymentOption, allowedPaymentOptions, chainId } )

    const { headerString } = clientExact
        .createXPaymentHeader( { scheme, network, authorization, signature } )

    if( !silent ) console.warn( 'Generated X-PAYMENT header:', headerString )

    return headerString
}


const args = Object
    .fromEntries(
        process.argv.slice( 2 ).map( ( arg ) => {
            const [ key, value ] = arg.split( '=' )
            return [ key.replace( /^--/, '' ), value || true ]
        } )
    )

const __filename = fileURLToPath( import.meta.url )
const __dirname = path.dirname( __filename )

const env = {
    envPath: path.resolve( __dirname, './../.chain-probe.env' ),
    envSelection: [
        [ 'clientPrivateKey',  'ACCOUNT_DEVELOPMENT_PRIVATE_KEY' ],
        [ 'clientProviderUrl', 'BASE_SEPOLIA_ALCHEMY_HTTP'       ],
        [ 'serverUrl',         'SERVER_URL'                      ],
        [ 'bearerToken',       'BEARER_TOKEN'                    ]
    ]
}

const cfg = {
    chainId: '84532',
    chainName: 'base-sepolia',
    allowedPaymentOptions: [
        {
            name: 'USDC',
            tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            decimals: 6,
            maxAmountRequired: '0.01'
        }
    ]
}


const silent = true //process.env.SILENT === 'true' || args.silent === 'true'
const { envPath, envSelection } = env
const { chainId, allowedPaymentOptions } = cfg

const { x402Credentials, privateKey } = ServerManager
    .getX402Credentials( { envPath, envSelection } )

const { serverUrl, bearerToken } = x402Credentials

if( !silent ) {
    console.warn( 'serverUrl:', serverUrl )
    console.warn( 'bearerToken:', bearerToken )
}

const clientExact = new ClientExact( { silent: true } )
    .init( { providerUrl: x402Credentials.clientProviderUrl } )

await clientExact
    .setWallet( { privateKey, allowedPaymentOptions } )

if( !silent ) {
    console.warn( 'Starting MCP STDIO↔SSE Proxy...' )
    console.warn( 'SSE URL:', serverUrl )

    if( bearerToken ) console.warn( 'Using Bearer token' )
}

const proxy = new MCPStdioSSEProxy( {
    serverUrl,
    bearerToken,
    getPaymentHeader: async ( ...args ) => {
        const header = await getPaymentHeader( ...args )

        if( !header ) return null

        return header
    },
    silent
} )

proxy.start()
