( function ( $, L, prettySize ) {
	var map;

	var abortFlag = false;
	var distancesByTypeAndMonth = [];
	var months = [];
	var activities = [];

	function status( message ) {
		$( '#currentStatus' ).text( message );
	}
	// Start at the beginning
	stageOne();

	function stageOne () {
		var dropzone;

		// Initialize the map
		map = L.map( 'map' ).setView( [0,0], 2 );
		L.tileLayer( 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: 'My CO2 Footprint is open source and available <a href="https://github.com/domsom/myco2footprint">on GitHub</a>. Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors.',
		} ).addTo( map );

		// Initialize the dropzone
		dropzone = new Dropzone( document.body, {
			url: '/',
			previewsContainer: document.createElement( 'div' ), // >> /dev/null
			clickable: false,
			accept: function ( file, done ) {
				stageTwo( file );
				dropzone.disable(); // Your job is done, buddy
			}
		} );

		// For mobile browsers, allow direct file selection as well
		$( '#file' ).change( function () {
			stageTwo( this.files[0] );
			dropzone.disable();
		} );
	}

	function stageTwo ( file ) {
		// Google Analytics event - upload file
		gtag('event', 'MyCO2Footprint', 'upload', undefined, file.size);

		var type;

		try {
			if ( /\.kml$/i.test( file.name ) ) {
				type = 'kml';
			} else {
				type = 'json';
			}
		} catch ( ex ) {
			status( 'Something went wrong generating your map. Ensure you\'re uploading a Google Takeout JSON file that contains location data and try again, or create an issue on GitHub if the problem persists. ( error: ' + ex.message + ' )' );
			return;
		}

		// First, change tabs
		$( 'body' ).addClass( 'working' );
		$( '#intro' ).addClass( 'hidden' );
		$( '#working' ).removeClass( 'hidden' );

		var os = new oboe();

		var lat, curLat, toLat;
		var lng, curLng, toLng;
		var SCALAR_E7 = 0.0000001; // Since Google Takeout stores latlngs as integers

		var date = new Date();
		var currentMonth;
		var currentMonthIndex = 0;

		// Init array
		distancesByTypeAndMonth['IN_ROAD_VEHICLE'] = [];
		distancesByTypeAndMonth['IN_RAIL_VEHICLE'] = [];
		for (i = 0; i < 12; i++) {
			distancesByTypeAndMonth['IN_ROAD_VEHICLE'][i] = 0;
			distancesByTypeAndMonth['IN_RAIL_VEHICLE'][i] = 0;
		}

		os.node( 'locations.*', function ( location ) {
			if (location.activity) {
				if ( type === 'json' ) {
					lat = location.latitudeE7 * SCALAR_E7;
					lng = location.longitudeE7 * SCALAR_E7;
				}
				// Set initial travel start position
				if ((curLat == null) || (curLng == null)) {
					curLat = lat;
					curLng = lng;
					return oboe.drop;
				}

				toLat = lat;
				toLng = lng;

				// Find highest confidence activity
				var activityType = '';
				var confidence = 0;
				location.activity.forEach(function(activity) {
					if ((activity.activity[0].confidence > confidence) && (activity.activity[0].type != 'TILTING')) {
						confidence = activity.activity[0].confidence;

						// If IN_VEHICLE and a more precise type is available, use that one
						if ((activity.activity[0].type == 'IN_VEHICLE') && (activity.activity.length > 1)){
							activityType = activity.activity[1].type;
						} else {
							activityType = activity.activity[0].type;
						}
					}
				});

				if (confidence > 0) {
					activities[activityType] = activityType;

					var distance = distanceInKmBetweenEarthCoordinates(curLat, curLng, toLat, toLng);
					var date = new Date(parseInt(location.timestampMs));
					if (currentMonth === undefined) {
						currentMonth = date.getMonth();
						months[currentMonthIndex] = date.getFullYear() + '/' + (date.getMonth()+1);
					}
					if (date.getMonth() != currentMonth) {
						currentMonthIndex++;
						if (currentMonthIndex >= 12) {
							abortFlag = true;
							this.abort();
							stageThree(  /* numberProcessed */ 0 );
							return oboe.drop;
						}
						currentMonth = date.getMonth();
						months[currentMonthIndex] = date.getFullYear() + '/' + (date.getMonth()+1);
					}

					if (!distancesByTypeAndMonth[activityType]) distancesByTypeAndMonth[activityType] = [];
					if (!distancesByTypeAndMonth[activityType][currentMonthIndex]) {
						distancesByTypeAndMonth[activityType][currentMonthIndex] = distance;
					} else {
						distancesByTypeAndMonth[activityType][currentMonthIndex] += distance;
					}
				}

				// Update current position
				curLat = toLat;
				curLng = toLng;
			}
			return oboe.drop;
		} ).done( function () {
			status( 'Generating map...' );
			stageThree(  /* numberProcessed */ 0 );

		} ).fail(function(err) {
			console.log('failed!');
			console.log(err);
		});

		var fileSize = prettySize( file.size );

		status( 'Preparing to import file ( ' + fileSize + ' )...' );

		// Now start working!
		if ( type === 'json' ) parseJSONFile( file, os );
		if ( type === 'kml' ) parseKMLFile( file );
	}

	function stageThree ( numberProcessed ) {
	    gtag('event', 'MyCO2Footprint', 'resultGraph-afterupload', undefined, numberProcessed);

		var $done = $( '#done' );

		// Change tabs :D
		$( 'body' ).removeClass( 'working' );
		$( '#working' ).addClass( 'hidden' );
		$done.removeClass( 'hidden' );

		// Calculate CO2 footprint, round distances
		var co2ByMonth = [], avgCo2ByMonth = [];
		var avgCo2 = 0, avgRelevantMonths = 0;
		for (i = 0; i < 12; i++) {
			co2ByMonth[i] = distancesByTypeAndMonth['IN_ROAD_VEHICLE'][i] * 140;
			co2ByMonth[i] += distancesByTypeAndMonth['IN_RAIL_VEHICLE'][i] * 55;

			distancesByTypeAndMonth['IN_ROAD_VEHICLE'][i] = Math.round(distancesByTypeAndMonth['IN_ROAD_VEHICLE'][i]);
			distancesByTypeAndMonth['IN_RAIL_VEHICLE'][i] = Math.round(distancesByTypeAndMonth['IN_RAIL_VEHICLE'][i]);

			co2ByMonth[i] = Math.round(co2ByMonth[i] / 1000 * 100) / 100; // kg

			if (co2ByMonth[i] > 0) {
				avgCo2 += co2ByMonth[i];
				avgRelevantMonths++;
			}
		}
		// Set average graph
		avgCo2 = Math.round(avgCo2 / avgRelevantMonths * 100) / 100;
		for (i = 0; i < 12; i++) {
			avgCo2ByMonth[i] = avgCo2;
		}

		// Draw result chart
		var resultChart = echarts.init(document.getElementById('resultchart'));
		var option = {
            title: {
                // text: 'My CO2 footprint (car & rail)'
            },
			tooltip: {
				trigger: 'axis',
				axisPointer: {
					type: 'cross',
					crossStyle: {
						color: '#999'
					}
				}
			},
			legend: {
                data: activities
            },
            xAxis: {
				type: 'category',
                data: months,
				axisPointer: {
					type: 'shadow'
				}
			},
            yAxis: [
				{
					type: 'value',
					name: 'km',
					min: 0,
					axisLabel: {
						formatter: '{value} km'
					}
				},
				{
					type: 'value',
					name: 'CO2',
					min: 0,
					axisLabel: {
						formatter: '{value} kg'
					}
				}
			],
            series: [
				{
					name: 'Car',
					type: 'bar',
					data: distancesByTypeAndMonth['IN_ROAD_VEHICLE']
				},
				{
					name: 'Train',
					type: 'bar',
					data: distancesByTypeAndMonth['IN_RAIL_VEHICLE']
				},
				{
					name:'CO2',
					type:'line',
					yAxisIndex: 1,
					data: co2ByMonth
				}
				,
				{
					name:'Average CO2',
					type:'line',
					yAxisIndex: 1,
					data: avgCo2ByMonth
				}
			]
		};
		// Customize facebook share button
		var url = 'https://www.facebook.com/plugins/share_button.php?href=http%3A%2F%2Fmyco2footprint.project23.de/show.html?data='+btoa(JSON.stringify(option))+'&layout=button&size=large&mobile_iframe=true&appId=324168168392224&width=72&height=28';
		document.getElementById('fb-share-button').setAttribute('src', url);
		resultChart.setOption(option);
	}

	/*
	Break file into chunks and emit 'data' to oboe instance
	*/

	function parseJSONFile( file, oboeInstance ) {
		var fileSize = file.size;
		var prettyFileSize = prettySize(fileSize);
		var chunkSize = 512 * 1024; // bytes
		var offset = 0;
		var self = this; // we need a reference to the current object
		var chunkReaderBlock = null;
		var startTime = Date.now();
		var endTime = Date.now();
		var readEventHandler = function ( evt ) {
			if (evt == 'abort') {
				console.log('received abort, emitting done');
				oboeInstance.emit( 'done' );
				return;
			}
			if ( evt.target.error == null ) {
				offset += evt.target.result.length;
				var chunk = evt.target.result;
				var percentLoaded = ( 100 * offset / fileSize ).toFixed( 0 );
				status( percentLoaded + '% of ' + prettyFileSize + ' loaded...' );
				oboeInstance.emit( 'data', chunk ); // callback for handling read chunk
			} else {
				return;
			}
			if ( offset >= fileSize ) {
				oboeInstance.emit( 'done' );
				return;
			}

			// of to the next chunk
			chunkReaderBlock( offset, chunkSize, file );
		}

		chunkReaderBlock = function ( _offset, length, _file ) {
			if (abortFlag) {
				console.log('abortFlag received');
				readEventHandler('abort');
				return;
			}
			var r = new FileReader();
			var blob = _file.slice( _offset, length + _offset );
			r.onload = readEventHandler;
			r.readAsText( blob );
		}

		// now let's start the read with the first block
		chunkReaderBlock( offset, chunkSize, file );
	}

	/*
        Default behavior for file upload (no chunking)	
	*/

	function parseKMLFile( file ) {
		var fileSize = prettySize( file.size );
		var reader = new FileReader();
		reader.onprogress = function ( e ) {
			var percentLoaded = Math.round( ( e.loaded / e.total ) * 100 );
			status( percentLoaded + '% of ' + fileSize + ' loaded...' );
		};

		reader.onload = function ( e ) {
			var latlngs;
			status( 'Generating map...' );
			latlngs = getLocationDataFromKml( e.target.result );
			heat._latlngs = latlngs;
			heat.redraw();
			stageThree( latlngs.length );
		}
		reader.onerror = function () {
			status( 'Something went wrong reading your JSON file. Ensure you\'re uploading a "direct-from-Google" JSON file and try again, or create an issue on GitHub if the problem persists. ( error: ' + reader.error + ' )' );
		}
		reader.readAsText( file );
	}

	function getLocationDataFromKml( data ) {
		var KML_DATA_REGEXP = /<when>( .*? )<\/when>\s*<gx:coord>( \S* )\s( \S* )\s( \S* )<\/gx:coord>/g,
			locations = [],
			match = KML_DATA_REGEXP.exec( data );

		// match
		//  [ 1 ] ISO 8601 timestamp
		//  [ 2 ] longitude
		//  [ 3 ] latitude
		//  [ 4 ] altitude ( not currently provided by Location History )
		while ( match !== null ) {
			locations.push( [ Number( match[ 3 ] ), Number( match[ 2 ] ) ] );
			match = KML_DATA_REGEXP.exec( data );
		}

		return locations;
	}

	// from https://gps-coordinates.org/js/distance.js
	function degreesToRadians(degrees) {
		return degrees * Math.PI / 180;
	  }
	  
	  function distanceInKmBetweenEarthCoordinates(lat1, lon1, lat2, lon2) {
		var earthRadiusKm = 6371;
	  
		var dLat = degreesToRadians(lat2-lat1);
		var dLon = degreesToRadians(lon2-lon1);
	  
		lat1 = degreesToRadians(lat1);
		lat2 = degreesToRadians(lat2);
	  
		var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
				Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2); 
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
		return earthRadiusKm * c;
	  }

}( jQuery, L, prettySize ) );
