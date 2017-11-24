const mapper = function(doc) {
    if(doc) {
	emit(null,doc)
    }
}

//const auth = "admin:1qaz@WSX"

const lister = function(head,req) {
    provides('json', function() {
	buffer  = [];
//	row = getRow();
//	buffer.push(row.value);
	
	while(row = getRow()) {
	    //send("," + JSON.stringify(row.value));
	    buffer.push(row.value)
	}
	return JSON.stringify(buffer);
    })
    provides('html', function() {
	html = [];
	html.push('<html><body><ul>');
	while(row = getRow())
	    html.push('<li>' + row.key + '</li>');
	html.push('</ul></body></html>');
	return html.join('');
    })

}

const bynumber = function(doc) {
    if(doc.number)
	emit(doc.number,doc);
}

const abilities = function(doc) {
    if(doc.abilities)
	emit(doc.abilities.join("."),doc);
}

exports.mapper = mapper;
exports.lister = lister;
exports.bynumber = bynumber;
exports.abilities = abilities;
