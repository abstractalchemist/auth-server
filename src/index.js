const http = require('http')
const https = require('https')
const express = require('express')
const bodyParser = require('body-parser')
const { Observable } = require('rxjs');

const { mapper, lister } = require('./utils')

const { from, create, of } = Observable;

const app = express()
//app.use(bodyParser.json())
const db_host = process.env['COUCHDB_HOST'] || 'localhost'
const db_port = process.env['COUCHDB_PORT'] || '5984'

const appid = process.env['FB_APP_ID']
const appsecret = process.env['FB_APP_SECRET']

console.log(`checking on db connection to ${db_host} on port ${db_port}`)

const httpPromise = function(opts, data) {
//    console.log(`going to ${opts.path}`)
//    console.log(opts)

    opts.method = opts.method || "GET"
    data = data || ""
    let mod = http
    if(opts.protocol === 'https:')
	mod = https
    console.log(`sending data ${data}`)
    return new Promise( (resolve,reject) => {
	try {
	    const request = mod.request(opts, (res) => {
		let buffer = []
		res.on('data', d => buffer.push(d))
		res.on('end', _ => {
		    if(res.statusCode === 200 || res.statusCode === 201) {
			resolve({headers:res.headers,body:buffer.join('')})
		    }
		    else {
			console.log(`rejecting with ${res.statusCode} and ${buffer.join('')}`)
			reject({status:res.statusCode,body:buffer.join('')})
		    }
		})
	    })
	    request.on('error', function(err) {
		console.log(`request error : ${err}`)
		reject(err)
	    })

	    request.write(data)
	    request.end()
	}
	catch(e) {
	    console.log('error running request')
	    console.log(e)
	    reject(e)
	}
    })
}


from(httpPromise({path:"/",hostname:db_host,port:db_port,method:"HEAD"}))
    .subscribe(
	_ => {
	},
	_ => {
	    console.log(`error checking db connection to ${db_host} on port ${db_port}`)
	},
	_ => {
	    console.log(`check on db connection to ${db_host} on port ${db_port} successful`)
	})

const checkAccessToken = function(token) {
    if(typeof token === 'object')
	token = token.headers['token']
    console.log(`checking access token ${token}`)
    return from(httpPromise({path:`/debug_token?input_token=${token}&access_token=${appid}|${appsecret}`, protocol:"https:", host:"graph.facebook.com"}))

	.map(({body}) => JSON.parse(body))
    	.do(data => console.log(data))
	.map(({data:{is_valid, app_id:incoming_app_id,user_id}}) => {
	    if(!is_valid)
		throw new Error("token not valid")
	    if(!incoming_app_id === appid)
		throw new Error("invalid application")
	    return {is_valid,app_id:appid,user_id}
	})
}

const createUserEntry = function(user_id) {
    return from(httpPromise({hostname:db_host, port:db_port, path:`/decks_${user_id}`,method:"PUT"}))
	.mergeMap(_ => httpPromise({hostname:db_host, port:db_port, path:`/decks_${user_id}/_design/view`,method:"PUT"},
				   JSON.stringify({
				       views: {
					   all: {
					       map: mapper.toString()
					   }
				       },
				       lists: {
					   all : lister.toString()
				       }})))
	.mergeMap(_ => httpPromise({hostname:db_host, port:db_port, path:`/library_${user_id}`,method:"PUT"}))
	.mergeMap(_ => httpPromise({hostname:db_host, port:db_port, path:`/library_${user_id}/_design/view`,method:"PUT"},
				   JSON.stringify({
				       views: {
					   all: {
					       map: mapper.toString()
					   }
				       },
				       lists: {
					   all : lister.toString()
				       }})))
	    
}


const findOrCreateUserDecks = function(user_id, rem) {
    return from(httpPromise({hostname:db_host, port:db_port, path:`/decks_${user_id}`,method:"HEAD"}))
	.catch(_ => {
	    return createUserEntry(user_id)
	
	})
	.mergeMap(_ => httpPromise({hostname:db_host, port:db_port, path:`/decks_${user_id}/${rem}`,method:"GET"}))
		
}

const findOrCreateUserLibrary = function(user_id, rem) {
    return from(httpPromise({hostname:db_host, port:db_port, path:`/library_${user_id}`,method:"HEAD"}))
	.catch(_ => {
	    return createUserEntry(user_id)
	
	})
	.mergeMap(_ => httpPromise({hostname:db_host, port:db_port, path:`/library_${user_id}/${rem}`,method:"GET"}))
		
}


const forward_response_headers = function({headers}, res) {
    for(let i in headers) {
	if(headers.hasOwnProperty(i))
	    res.append(i, headers[i])
    }
    
}

const readRequestData = function(req) {
    return create(observer => {
	let buffer = []
	req.on('data', d => buffer.push(d))
	req.on('end', _ => {
	    observer.next(buffer.join(''))
	    observer.complete()
	})
    })
    
}

const check_public_dbs = function({path}) {
    return from(httpPromise({hostname:db_host,port:db_port,path:"/cardsets/sets"}))
	.pluck('body')
	.map(JSON.parse)
	.mergeMap(({sets}) => {
	    let request = /^\/api\/(.+)(\/(.+)){0,1}/.exec(path)
	    if(request) {
		console.log(`checking ${request[1]} `)
		let valid = sets.filter( ({id}) => id === request[1] );
		if(valid || request[1] === 'cardsets' || request[1] === 'cardmapping' || request[1] === '_uuids')
		    return of(sets)
		
	    }
	    throw new Error(`${path} is not a public url`)
	})
}

const build_query_string = ({query}) => {
    let buffer = []
    if(query) {
	for(let i in query) {
	    if(query.hasOwnProperty(i)) {
		buffer.push(`${i}=${query[i]}`)
	    }
	}
    }
    return buffer.join('&')

}

app.get(/^\/api\/(.+)/, (req, res) => {
//    console.log(`api match, mapping to ${req.path}`)
    let match;
    if(match = /^\/api\/(decks|library)\/(.+)/.exec(req.path)) {
	console.log('must authenticate')
//	console.log(req.headers)
	let token = req.headers['token']
	if(token) {
	    checkAccessToken(token)
		.subscribe(
		    ({user_id}) => {
			// map and get data
			if(match[1] === 'decks') {
			    let data;
			    
			    findOrCreateUserDecks(user_id, match[2])
//			    .map(JSON.parse)
			    .subscribe(
				d => {
				    data = d
				},
				_ => {
				    res.status(500).end()
				},
				_ => {
				    forward_response_headers(data, res)
				    console.log(data.body)
				    res.send(data.body).end()
				})
			}
				    
		    },
		    err => {
			console.log(`some error occurred ${err}`)
//			console.log(err)
			res.status(401).end()
		    },
		    _ => {
		    })
			    
	}
	else {
	    console.log('no token found')
	    res.status(401).end()
	}
	
    }
    else {
	match = /^\/api\/(.+)/.exec(req.path)
	check_public_dbs(req).
	    subscribe(
		_ => {
		},
		err => {
		    console.log(err)
		    res.status(401).end()
		},
		_ => {
		    
		    
		    let data_res;
		    let headers = req.headers;
		    delete headers.host
		    from(httpPromise({hostname:db_host, path:`/${match[1]}?${build_query_string(req)}`,port:db_port,method:"GET"}))
			.subscribe(
			    d => {
				data_res = d;
			    },
			    err => {
				console.log(`some error occurred ${err}`)
				res.status(500).end()
			    },
			    _ => {
				if(data_res) {
				    forward_response_headers(data_res, res)
				    res.write(data_res.body)
				    res.end()
				}
			    })
		})
    }
	    
})

app.post(/^\/api\/(.*)/, (req, res) => {
    console.log('must authenticate')
    //	console.log(req.headers)
    let token = req.headers['token']
    if(token) {
	checkAccessToken(token)
	    .subscribe(
		({user_id}) => {
		   		    
		},
		err => {
		    console.log(`some error occurred ${err}`)
		    //			console.log(err)
		    res.status(401).end()
		},
		_ => {
		})
	
    }
    else {
	console.log('no token found')
	res.status(401).end()
    }
    
})



app.put(/^\/api\/(.*)/, (req, res) => {
	console.log('must authenticate')
    //	console.log(req.headers)
    let token = req.headers['token']
    if(token) {
	checkAccessToken(token)
	    .subscribe(
		({user_id}) => {
		    // map and get data
		   
		    let match = /^\/api\/decks\/(.+)/.exec(req.path)
		    if(match) {
			console.log(`adding ${match[1]} to user decks with ${req.body}`)
			let buffer = []
			readRequestData(req)
			    .map(JSON.parse)
			    .mergeMap(data => httpPromise({hostname:db_host,port:db_port,path:`/decks_${user_id}/${match[1]}`,method:"PUT"}, JSON.stringify(data)))
			    .subscribe(
				_ => {
				},
				_ => {
				    res.status(500).end()
				},
				_ => {
				    res.status(200).end()
				})
		    }
		},
		err => {
		    console.log(`some error occurred ${err}`)
		    //			console.log(err)
		    res.status(401).end()
		},
		_ => {
		})
	
    }
    else {
	console.log('no token found')
	res.status(401).end()
    }
    
})

app.delete(/^\/api\/(.+)\/(.+)/, (req,res) => {
    let user_id;
    checkAccessToken(req)
	.subscribe(
	    ({user_id:id}) => {
		user_id = id
	    },
	    err => {
		res.status(401).end()
	    },
	    _ => {
		if(req.params[0] === 'decks') {
		    from(httpPromise({hostname:db_host,port:db_port,path:`/decks_${user_id}/${req.params[1]}?${build_query_string(req)}`,method:"DELETE"}))
			 .subscribe(
			     _ => {
			     },
			     err => {
				 res.status(401).end()
			     },
			     _ => {
				 res.status(200).end()
			     })
		}
		else if(req.params[1] === 'library') {
		}
	    })
})

app.listen(9000)

exports.app = app
exports.findOrCreateUserDecks = findOrCreateUserDecks
exports.findOrCreateUserLibrary = findOrCreateUserLibrary
exports.checkAccessToken = checkAccessToken
