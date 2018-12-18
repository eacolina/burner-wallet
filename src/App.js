import React, { Component } from 'react';
import { ContractLoader, Dapparatus, Transactions } from "dapparatus";
import Web3 from 'web3';
import axios from 'axios';
import './App.scss';
import Header from './components/Header';
import NavCard from './components/NavCard';
import SendByScan from './components/SendByScan';
import SendToAddress from './components/SendToAddress';
import SendWithLink from './components/SendWithLink';
import ShareLink from './components/ShareLink'
import MainCard from './components/MainCard';
import BottomLinks from './components/BottomLinks';
import BridgeCard from './components/BridgeCard';
import Footer from './components/Footer';
import Loader from './components/Loader';

let WEB3_PROVIDER = 'http://0.0.0.0:8545', CLAIM_RELAY = 'http://0.0.0.0:18462';
if (window.location.hostname.indexOf("qreth") >= 0) {
  WEB3_PROVIDER = "https://mainnet.infura.io/v3/e59c464c322f47e2963f5f00638be2f8"
}
else if (window.location.hostname.indexOf("xdai") >= 0) {
  WEB3_PROVIDER = "https://dai.poa.network";
  CLAIM_RELAY = 'https://x.xdai.io'
}

class App extends Component {

  constructor(props) {
    super(props);
    this.state = {
      web3: false,
      account: false,
      gwei: 1.1,
      view: 'main',
      sendLink: "",
      sendKey: "",
      alert: null,
      loadingTitle:'loading...'
    };
    this.alertTimeout = null;
  }

  componentDidMount(){
    if(window.location.pathname){
      if(window.location.pathname.length==43){
        this.changeView('send_to_address')
      }else if(window.location.pathname.length==134){
        let parts = window.location.pathname.split(";")
        let claimId = parts[0].replace("/","")
        let claimKey = parts[1]
        console.log("DO CLAIM",claimId,claimKey)
        this.setState({claimId,claimKey})
      }
    }
  }

  componentDidUpdate(prevProps, prevState) {
    let { network, web3 } = this.state;
    if (web3 && network !== prevState.network && !this.checkNetwork()) {
      console.log(web3, network, prevState.network);
      this.changeAlert({
        type: 'danger',
        message: 'Wrong Network. Please use Custom RPC endpoint: https://dai.poa.network'
      }, false)
    }
  };

  checkNetwork() {
    let { network } = this.state;
    return network === "xDai" || network === "Unknown";
  }

  checkClaim(tx, contracts) {
    //check if we are trying to claim
    if (this.state.claimId && this.state.claimKey) {
      this.changeView('claimer')
      if (this.state.balance > 0.005) {
        this.chainClaim(tx, contracts);
      } else {
        this.relayClaim();
      }
    }
  }

  chainClaim(tx, contracts) {
    console.log("DOING CLAIM ONCHAIN", this.state.claimId, this.state.claimKey, this.state.account);
    this.setState({sending: true})

    contracts.Links.funds(this.state.claimId).call().then((fund) => {
      if (fund) {
        this.setState({fund: fund})
        console.log("FUND: ", fund)

        let hashOfDestination = this.state.web3.utils.soliditySha3(
          {type: 'bytes32', value: this.state.claimId}, // fund id
          {type: 'address', value: this.state.account}, // destination address
          {type: 'uint256', value: fund[3]}, // nonce
          {type: 'address', value: contracts.Links._address} // contract address
        )
        console.log("hashOfDestination", hashOfDestination)
        console.log("this.state.claimKey", this.state.claimKey)
        let sig = this.state.web3.eth.accounts.sign(hashOfDestination, this.state.claimKey);
        sig = sig.signature;
        console.log("CLAIM TX:", this.state.claimId, sig, this.state.account)
        tx(contracts.Links.claim(this.state.claimId, sig, this.state.account), 150000, false, 0, (result) => {
          if (result) {
            console.log("CLAIMED!!!", result)
            this.setState({claimed: true})
            setTimeout(() => {
              this.setState({sending: false}, () => {
                //alert("DONE")
                window.location = "/"
              })
            }, 2000)
          }
        })
      }
    })
  }

  relayClaim() {
    console.log("DOING CLAIM THROUGH RELAY")
    this.state.contracts.Links.funds(this.state.claimId).call().then((fund) => {
      if (fund) {
        this.setState({fund: fund})
        console.log("FUND: ", fund)

        let hashOfDestination = this.state.web3.utils.soliditySha3(
          {type: 'bytes32', value: this.state.claimId}, // fund id
          {type: 'address', value: this.state.account}, // destination address
          {type: 'uint256', value: fund[3]}, // nonce
          {type: 'address', value: this.state.contracts.Links._address} // contract address
        )
        console.log("hashOfDestination", hashOfDestination)
        console.log("this.state.claimKey", this.state.claimKey)
        let sig = this.state.web3.eth.accounts.sign(hashOfDestination, this.state.claimKey);
        sig = sig.signature
        console.log("CLAIM TX:", this.state.claimId, sig, this.state.account)

        this.setState({sending: true})
        let postData = {
          id: this.state.claimId,
          sig: sig,
          dest: this.state.account
        }
        console.log("CLAIM_RELAY:", CLAIM_RELAY)
        axios.post(CLAIM_RELAY + "/link", postData, {
          headers: {
            'Content-Type': 'application/json',
          }
        }).then((response) => {
          console.log("TX RESULT", response.data.transactionHash)
          this.setState({claimed: true})
          setTimeout(() => {
            this.setState({sending: false}, () => {
              //alert("DONE")
              window.location = "/"
            })
          }, 2000)
        })
          .catch((error) => {
            console.log(error);
          });
      }
    })
  }


  changeView = (view) => {
    if (view.startsWith('send')) {
      if (this.state.balance <= 0) {
        this.changeAlert({
          type: 'danger',
          message: 'Insufficient funds',
        });
        return;
      }
    }
    this.changeAlert(null);
    this.setState({ view });
  };

  changeAlert = (alert, hide=true) => {
    clearTimeout(this.alertTimeout);
    this.setState({ alert });
    if (alert && hide) {
      this.alertTimeout = setTimeout(() => {
        this.setState({ alert: null });
      }, 2000);
    }
  };
  goBack(){
    this.changeView('main')
    window.scrollTo(0,0);
  }
  render() {
    let {
      web3, account, tx, gwei, block, avgBlockTime, etherscan, balance, metaAccount, burnMetaAccount, view, alert,
      send
    } = this.state;


    let web3_setup = ""
    if(web3){
      web3_setup = (
        <div>
          <ContractLoader
            key="ContractLoader"
            config={{DEBUG: true}}
            web3={web3}
            require={path => {
              return require(`${__dirname}/${path}`)
            }}
            onReady={(contracts, customLoader) => {
              console.log("contracts loaded", contracts)
              this.setState({contracts: contracts}, async () => {
                console.log("Contracts Are Ready:", contracts)
                this.checkClaim(tx, contracts);
              })
            }}
          />
          <Transactions
            key="Transactions"
            config={{DEBUG: false, hide: true}}
            account={account}
            gwei={gwei}
            web3={web3}
            block={block}
            avgBlockTime={avgBlockTime}
            etherscan={etherscan}
            metaAccount={metaAccount}
            onReady={(state) => {
              console.log("Transactions component is ready:", state);
              this.setState(state)

            }}
            onReceipt={(transaction, receipt) => {
              // this is one way to get the deployed contract address, but instead I'll switch
              //  to a more straight forward callback system above
              console.log("Transaction Receipt", transaction, receipt)
            }}
          />
        </div>
      )
    }
    return (
      <div>

        {web3_setup}

        <div className="container-fluid">
          <Header changeView={this.changeView} />
          {web3 && this.checkNetwork() && (() => {
            switch(view) {
              case 'main':
                return (
                  <div>
                    <MainCard
                      address={account}
                      balance={balance}
                      changeAlert={this.changeAlert}
                      changeView={this.changeView}
                    />
                    <BridgeCard
                      privateKey={metaAccount.privateKey}
                      burnWallet={burnMetaAccount}
                      changeAlert={this.changeAlert}
                    />
                    <BottomLinks/>
                  </div>
                );
              case 'send_by_scan':
                return (
                  <SendByScan
                    goBack={this.goBack.bind(this)}
                    changeView={this.changeView}
                    onError={(error) =>{
                      this.changeAlert("danger",error)
                    }}
                  />
                );
              case 'send_to_address':
                return (
                  <div>
                    <NavCard title={'Send to Address'} goBack={this.goBack.bind(this)}/>
                    <SendToAddress
                      balance={balance}
                      address={account}
                      send={send}
                      goBack={this.goBack.bind(this)}
                      changeView={this.changeView}
                      changeAlert={this.changeAlert}
                    />
                  </div>
                );
              case 'share-link':
                return (
                  <div>
                    <NavCard title={'Share Link'} goBack={this.goBack.bind(this)} />
                    <ShareLink
                      sendKey={this.state.sendKey}
                      sendLink={this.state.sendLink}
                      balance={balance}
                      address={account}
                      changeAlert={this.changeAlert}
                      goBack={this.goBack.bind(this)}
                    />
                  </div>
                );
              case 'send_with_link':
                return (
                  <div>
                    <NavCard title={'Send with Link'} goBack={this.goBack.bind(this)} />
                    <SendWithLink balance={balance}
                      changeAlert={this.changeAlert}
                      sendWithLink={(amount,cb)=>{
                        let randomHash = this.state.web3.utils.sha3(""+Math.random())
                        let randomWallet = this.state.web3.eth.accounts.create()
                        let sig = this.state.web3.eth.accounts.sign(randomHash, randomWallet.privateKey);
                        console.log("STATE",this.state,this.state.contracts)
                        this.state.tx(this.state.contracts.Links.send(randomHash,sig.signature),140000,false,amount*10**18,async (receipt)=>{
                          this.setState({sendLink: randomHash,sendKey: randomWallet.privateKey},()=>{
                            console.log("STATE SAVED",this.state)
                          })
                          cb(receipt)
                        })
                      }}
                      address={account}
                      changeView={this.changeView}
                      goBack={this.goBack.bind(this)}
                    />
                  </div>
                );
              case 'loader':
                return (
                  <div>
                    <NavCard title={"Sending..."} goBack={this.goBack.bind(this)}/>
                    <Loader />
                  </div>
                );
              case 'reader':
                return (
                  <div>
                    <NavCard title={"Reading QRCode..."} goBack={this.goBack.bind(this)}/>
                    <Loader />
                  </div>
                );
              case 'claimer':
                return (
                  <div>
                    <NavCard title={"Claiming..."} goBack={this.goBack.bind(this)}/>
                    <Loader />
                  </div>
                );
              default:
                return (
                  <div>unknown view</div>
                )
            }
          })()}
          { alert && <Footer alert={alert} changeAlert={this.changeAlert}/> }
        </div>

        <Dapparatus
          config={{
            DEBUG: false,
            hide: true,
            requiredNetwork: ['Unknown', 'xDai'],
            metatxAccountGenerator: false,
          }}
          fallbackWeb3Provider={WEB3_PROVIDER}
          onUpdate={(state) => {
            console.log("Dapparatus state update:", state)
            if (state.web3Provider) {
              state.web3 = new Web3(state.web3Provider)
              this.setState(state)
            }
          }}
        />
      </div>
    )
  }
}

export default App;
