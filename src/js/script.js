var app = new Vue({
	el: "#app",
	data: {
		current: "bitcoin",
		currentFiat: "USD",
		currencies: {
			USD: "$",
			CAD: "$",
			CNY: "¥",
			EUR: "€",
			GBP: "£",
			JPY: "¥"
		},
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
		msg: {
			title: "",
			status: "positive",
			reason: ""
		}
	},
	methods: {
		init: function (net) {
			var keys = BLTWallet.createNewAddress(net);
			window.location.hash = `#${net[0]}-${rot13(keys[0])}-USD`;
			window.location.reload();
		},
		checkKey: function (priv_key) {
			var keyPair = blt.ECPair.fromWIF(
					priv_key,
					(this.current == "bitcoin") ? blt.networks.testnet : blt.networks.ltestnet
				);
			var address = keyPair.getAddress();

			if (window.location.hash[1] == "b") {
				if (BLTWallet.checkValidAddress(address, 'bitcoin')) {
					this.bitcoin.address = address;
					this.current = "bitcoin";
					return true;
				}
			} else if (window.location.hash[1] == "l") {
				if (BLTWallet.checkValidAddress(address, 'litecoin')) {
					this.litecoin.address = address;
					this.current = "litecoin";
					return true;
				}
			}

			return false;
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
		getUnspentTransactions: async (sendAmount, tx, keyPair) => {
			let res = await fetch(`${app.baseURL}/api/addr/${app.address}/utxo`);
			return await res.json();
		},
		maxAmount: function () {
			if (this[this.current].amount > .001) {
				$('#send-amount')[0].value = (this[this.current].amount - .001).toFixed(8);
				return;
			}
			this.msg = {
				status: "negative",
				title: "Not enough coins in wallet.",
				reason: "Try sending some more coins to this wallet. :)"
			};
		},
		sendTx: async (hex) => {
			let formData = new FormData();
			formData.append('rawtx', hex);

			let res = await fetch(`${app.baseURL}/api/tx/send`, {
				method: "POST",
				body: new URLSearchParams(formData)
			});

			let data = await res.json();

			app.msg = data.txid ? {
				status:"positive",
				title: "Transaction was successfully sent! Please wait for the wallet to update.",
				reason: `TXID: ${data.txid}`
			} : {
				status: "negative",
				title: "Could not send transaction",
				reason: "Something went wrong. :("
			}

			if (data.txid) this.updateData();
		},
		sendTransaction: async () => {
			var sendAmount = parseFloat($('#send-amount')[0].value);
			var recvAddress = $('#receive-address')[0].value;

			// check for valid testnet address
			if (BLTWallet.checkValidAddress(recvAddress, app.current)) {
				if (app[app.current].amount > 0 && sendAmount < app[app.current].amount) {
					var keyPair = blt.ECPair.fromWIF(rot13(window.location.hash.match(/(b|l)\-([a-zA-Z0-9]+)(-([A-Z]{3}))?/)[2]),
							app.current == "bitcoin" ? blt.networks.testnet : blt.networks.ltestnet
						);
					var tx = new blt.TransactionBuilder(app.current == "bitcoin" ? blt.networks.testnet : blt.networks.ltestnet);

					let res = await app.getUnspentTransactions(sendAmount, tx, keyPair);
					var tx_hex = BLTWallet.buildTransaction(sendAmount, recvAddress, res, tx, keyPair);

					await app.sendTx(tx_hex);
					await app.updateData();
					return;
				}

				app.msg = {
					status: "negative",
					title: "Not enough coins in wallet.",
					reason: "Try sending some more coins to this wallet. :)"
				};
				return;
			}
			app.msg = {
				status: "negative",
				title: "Address is not valid",
				reason: "This is not a valid address"
			};
		},
		switchCurrency: function () {
			this.init(this.current == "bitcoin" ? "litecoin" : "bitcoin");
		},
		updateData: async () => {
			await app.updatePrices();
			await app.updateTransactions();
		},
		updateFiat: function (currency) {
			window.location.hash = window.location.hash.replace(/-[A-Z]{3}$/g, '-' + currency);
			window.location.reload();
		},
		updatePrices: async () => {
			let res = await fetch(`https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,LTC&tsyms=${app.currentFiat}`);
			let data = await res.json();

			app.bitcoin.price = data['BTC'][app.currentFiat];
			app.litecoin.price = data['LTC'][app.currentFiat];
		},
		updateTransactions: async () => {
			let res = await fetch(`${app.baseURL}/api/addr/${app.address}`);
			let data = await res.json();

			if (app[app.current].amount != data['balance']) {
				document.getElementById('audio').play();
			}

			app[app.current].amount = data['balance'];

			res = await fetch(`${app.baseURL}/api/txs/?address=${app.address}`);
			data = await res.json();

			app[app.current].tx = data['txs'].length ? data['txs'] : [];
		}
	},
	computed: {
		address: function () {
			return this[this.current].address;
		},
		amount: function () {
			return `${this[this.current].amount} t${this[this.current].symbol}`;
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
			return `${this.currencies[this.currentFiat]}${(this[this.current].amount * this[this.current].price).toFixed(2)} ${this.currentFiat}`;
		},
		symbol: function () {
			return this[this.current].symbol;
		},
		transactions: function () {
			return this[this.current].tx;
		}
	}
})

let BLTWallet = {
	buildTransaction(sendAmount, recvAddress, inputs, tx, keyPair) {
		var spendAmount = 0.0;
		var num_inputs = 0;
		const fee = .001;

		inputs.sort(function (a, b) { return parseFloat(a.value) - parseFloat(b.value) });
		inputs.forEach(function(intx) {
			if ((sendAmount + fee) > spendAmount){
				spendAmount += intx.amount;
				num_inputs += 1;
				tx.addInput(intx.txid, intx.vout);
			}
			return;
		});

		// check if there is enough balancekm
		if (spendAmount < sendAmount + fee) {
			app.msg = {
				status: "negative",
				title: "Not enough coins in wallet.",
				reason: "Try sending some more coins to this wallet. :)"
			};
		} else {
			tx.addOutput(recvAddress, sendAmount * 100000000);
			tx.addOutput(app[app.current].address, parseFloat(((spendAmount - sendAmount - fee) * 100000000).toFixed(0)));
			for (var i = 0; i < num_inputs; i++) {
				tx.sign(i, keyPair);
			}
		}

		return tx.buildIncomplete().toHex();
	},
	createNewAddress(network){
		var network = network == "bitcoin" ? blt.networks.testnet : blt.networks.ltestnet;
		var keyPair = blt.ECPair.makeRandom({ network: network });
		var pkey = keyPair.toWIF();
		var address = keyPair.getAddress();
		return [pkey, address];
	},
	checkValidAddress(address, network) {
		try {
			if (network == "bitcoin") {
				return blt.address.fromBase58Check(address, blt.networks.testnet);
			};
			return blt.address.fromBase58Check(address, blt.networks.ltestnet);
		} catch(err) {
			return false;
		}
	}
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
	if (/(b|l)\-([a-zA-Z0-9]+)-([A-Z]{3})/.test(window.location.hash)) {
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