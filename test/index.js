const chai = require('chai')
const chaiHttp = require('chai-http')
const { app, findOrCreateUserDecks } = require('../src/index')

chai.use(chaiHttp)

describe('routes', function() {
    it('/api/cardsets', function(done) {
	chai.request(app)
	    .get('/api/cardsets')
	    .end( (err, res) => {
		done()
	    })
	   
    })

    
    it('/api/decks/decks', function(done) {
	chai.request(app)
	    .get('/api/decks/decks')
	    .set('TOKEN','ffffffffffffffffffffffff')
	    .end( (err, res) => {
		done()
	    })

    })
    it('/api/library/library', function(done) {
	chai.request(app)
	    .get('/api/library/library')
	    .set('TOKEN','ffffffffffffffffffffffff')
	    .end( (err, res) => {
		done()
	    })

	
    })

    it('findOrCreateUserDecks', function(done) {
	findOrCreateUserDecks('ffffff')
	    .subscribe(
		_ => {
		},
		_ => {
		},
		_ => {
		    done()
		})
    })

    
})
