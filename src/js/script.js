var app = new Vue({
	el: "#app",
	data: {
		current: "bitcoin",
		currentFiat: "USD",
		bitcoin: {
			address: "",
			amount: 0,
			color: "orange",
			faucets: [
				["qc.to", "https://testnet.qc.to/"],
				["nkuttler", "https://kuttler.eu/en/bitcoin/btc/faucet/"],
				["flyingkiwi", "https://testnet.manu.backend.hamburg/faucet"],
				["coinfaucet", "https://testnet.coinfaucet.eu/en/"]
			],
			price: 0,
			symbol: "BTC",
			tx: [
			]
		},
		litecoin: {
			address: "",
			amount: 0,
			color: "grey",
			faucets: [
				["nkuttler", "https://kuttler.eu/en/bitcoin/ltc/faucet/"],
				["lctools", "http://testnet.litecointools.com/"],
				["thrasher", "https://testnet.thrasher.io/"]
			],
			price: 0,
			symbol: "LTC",
			tx: [
			]
		},
		currencies: {
			USD: "$",
			CAD: "$",
			CNY: "¥",
			EUR: "€",
			GBP: "£",
			JPY: "¥"
		},
		msg: {
			title: "",
			status: "positive",
			reason: ""
		}
	},
	methods: {
		init: function (net) {
			var keys = createNewAddress(net);
			window.location.hash = "#" + net[0] + "-" + rot13(keys[0]) + "-USD";
			window.location.reload();
		},
		buildTransaction: function (send_amount, recipient_address, inputs, tx, keyPair) {
			var spend_amount = 0.0;
			var num_inputs = 0;
			const fee = .001;

			inputs.sort(function (a, b) { return parseFloat(a.value) - parseFloat(b.value) });
			inputs.forEach(function(intx) {
			    if ((send_amount + fee) > spend_amount){
			    	spend_amount += intx.amount;
			    	num_inputs += 1;
					tx.addInput(intx.txid, intx.vout);
			    } else {
			    	return;
			    }
			});


			// check if there is enough balancekm
			if (spend_amount < send_amount + fee) {
				this.msg.status = "negative";
				this.msg.title = "Not enough coins in wallet.";
				this.msg.reason = "Try sending some more coins to this wallet. :)";
			} else {
				tx.addOutput(recipient_address, send_amount * 100000000);
			    tx.addOutput(this[this.current].address, parseFloat(((spend_amount - send_amount - fee) * 100000000).toFixed(0)));
			    for (var i = 0; i < num_inputs; i++) {
			    	tx.sign(i, keyPair);
			    }
			}

	        return tx.buildIncomplete().toHex();
		},
		checkKey: function (priv_key) {
			var keyPair = blt.ECPair.fromWIF(
					priv_key,
					(this.current == "bitcoin") ? blt.networks.testnet : blt.networks.ltestnet
				);
			var address = keyPair.getAddress();

			if (window.location.hash[1] == "b") {
				if (isValidAddress(address, 'bitcoin')) {
					this.bitcoin.address = address;
					this.current = "bitcoin";
					return true;
				}
			} else if (window.location.hash[1] == "l") {
				if (isValidAddress(address, 'litecoin')) {
					this.litecoin.address = address;
					this.current = "litecoin";
					return true;
				}
			}
		},
		copyAddress: function () {
			var input = document.createElement('input');
			input.setAttribute("id", "address");
			input.setAttribute("class", "hidden");
			input.setAttribute("value", this.address);
			document.body.appendChild(input);

			// copy address
			document.getElementById('address').select();
			document.execCommand('copy');

			// remove element
			input.remove();
		},
		getOutputValue: function (vouts) {
			for (var i = 0; i < vouts.length; i++) {
				if (vouts[i].scriptPubKey.addresses[0] == this.address) return vouts[i].value;
			}
		},
		getUnspentTransactions: function (send_amount, tx, keyPair) {
			return $.get(this.baseURL + "/api/addr/" + this.address + "/utxo");
		},
		maxAmount: function () {
			if (this[this.current].amount > .001) {
				$('#send-amount')[0].value = (this[this.current].amount - .001).toFixed(8);
			} else {
				this.msg.status = "negative";
				this.msg.title = "Not enough coins in wallet.";
				this.msg.reason = "Try sending some more coins to this wallet. :)";
			}
		},
		sendTx: function (hex) {
			return $.post(app.baseURL + "/api/tx/send", {
			    rawtx : hex,
			}).done(function(res) {
				if (res.txid) {
					app.msg.status = "positive";
					app.msg.title = "Transaction was successfully sent! Please wait for the wallet to update.";
					app.msg.reason = "TXID: " + res.txid;
				} else {
					app.msg.status = "negative";
					app.msg.title = "Could not send transaction";
					app.msg.reason = "Something went wrong. :(";
				}
			});
		},
		sendTransaction: function () {
			var send_amount = parseFloat($('#send-amount')[0].value);
			var recipient_address = $('#receive-address')[0].value;

			// check for valid testnet address
			if (isValidAddress(recipient_address, this.current)) {
				if (this[this.current].amount > 0 && send_amount < this[this.current].amount) {
					var keyPair = blt.ECPair.fromWIF(rot13(window.location.hash.match(/(b|l)\-([a-zA-Z0-9]+)(-([A-Z]{3}))?/)[2]),
							this.current == "bitcoin" ? blt.networks.testnet : blt.networks.ltestnet
						);
				    var tx = new blt.TransactionBuilder(this.current == "bitcoin" ? blt.networks.testnet : blt.networks.ltestnet);

				    app.getUnspentTransactions(send_amount, tx, keyPair)
				    .done(function (res) {
						var tx_hex = app.buildTransaction(send_amount, recipient_address, res, tx, keyPair);
						return app.sendTx(tx_hex);
					}).done(function () {
						return app.updateData();
					});
			    } else {
			    	this.msg.status = "negative";
					this.msg.title = "Not enough coins in wallet.";
					this.msg.reason = "Try sending some more coins to this wallet. :)";
			    }
			} else {
				this.msg.status = "negative";
				this.msg.title = "Address is not valid";
				this.msg.reason = "This is not a valid address";
			}
		},
		switchCurrency: function () {
			this.init((this.current == "bitcoin") ? "litecoin" : "bitcoin");
		},
		updateData: function () {
			if (app.address != "") {
				app.updatePrices().then(app.updateTransactions);
			}
		},
		updateFiat: function (currency) {
			window.location.hash = window.location.hash.replace(/-[A-Z]{3}$/g, '-' + currency);
			window.location.reload();
		},
		updatePrices: function () {
			return $.get("https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,LTC&tsyms=" + this.currentFiat).done(function(res) {
			  app.bitcoin.price = res['BTC'][app.currentFiat];
			  app.litecoin.price = res['LTC'][app.currentFiat];
			});
		},
		updateTransactions: function () {
			return $.ajax({
		        type: "get",
		        url: app.baseURL + "/api/addr/" + app.address,
		        success: function (res) {
		            if (app[app.current].amount != res['balance']) {
						document.getElementById('audio').play();
					}
					app[app.current].amount = res['balance'];
		            $.ajax({
		                type: "get",
		                url: app.baseURL + "/api/txs/?address=" + app.address,
		                success: function (data) {
		                	app[app.current].tx = data['txs'] ? data['txs'] : [];
		                }
		            });
		        }
		    });
		}
	},
    computed: {
    	address: function () {
			return this[this.current].address;
	    },
        amount: function () {
			return this[this.current].amount + " t" + this[this.current].symbol;
	    },
	    baseURL: function () {
	    	return app.symbol == "BTC" ? "https://test-insight.bitpay.com" : "https://testnet.litecore.io"
	    },
	    color: function () {
			return this[this.current].color;
	    },
        faucets: function() {
            return this[this.current].faucets;
        },
    	fiat_amount: function () {
			return this.currencies[this.currentFiat] + (this[this.current].amount * this[this.current].price).toFixed(2) + " " + this.currentFiat;
	    },
	    symbol: function () {
	    	return this[this.current].symbol;
	    },
	    transactions: function () {
	    	return this[this.current].tx;
	    }
    }
})

function isValidAddress(address, network) {
	try {
	    if (network == "bitcoin") {
			return blt.address.toOutputScript(address, blt.networks.testnet);
		} else {
			return blt.address.toOutputScript(address, blt.networks.ltestnet);
		}
	} catch(err) {
		return false;
	}
}

function createNewAddress(network) {
    var network = network == "bitcoin" ? blt.networks.testnet : blt.networks.ltestnet;
	var keyPair = blt.ECPair.makeRandom({ network: network });
	var pkey = keyPair.toWIF();
	var address = keyPair.getAddress();
	return [pkey, address];
}

// rot13 implementation
// https://stackoverflow.com/questions/617647/where-is-my-one-line-implementation-of-rot13-in-javascript-going-wrong
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, function(chr) {
    var start = chr <= 'Z' ? 65 : 97;
    return String.fromCharCode(start + (chr.charCodeAt(0) - start + 13) % 26);
  });
}

function showModal() {
	$('.modal').modal('show');
}

$(document).ready(function() {
	// check if valid wallet address
	if (/(b|l)\-([a-zA-Z0-9]+)(-([A-Z]{3}))?/.test(window.location.hash)) {
		// set currency
		var user_currency = window.location.hash.match(/(b|l)\-([a-zA-Z0-9]+)(-([A-Z]{3}))?/)[4];
		if (user_currency in app.currencies) {
			app.currentFiat = user_currency;
		}
		try {
		    if (app.checkKey(rot13(window.location.hash.match(/(b|l)\-([a-zA-Z0-9]+)(-([A-Z]{3}))?/)[2]))) {
				app.updateData();
			}
		} catch(err) {
			app.init('bitcoin');
		}
	} else {
		app.init('bitcoin');
	};
	$('.ui.dropdown').dropdown();
	setInterval(app.updateData, 30 * 1000);
});