define(function(require) {
	var modC = require('./sub/mod-c');
	var tplA = require('./tpl-a.tpl.html');
	if (process.env.NODE_ENV === 'prd') {
		console.log('prd');
	}

	return {};
});