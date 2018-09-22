( function ( $, L, prettySize ) {
	var map, heat,
		heatOptions = {
			tileOpacity: 1,
			heatOpacity: 1,
			radius: 25,
			blur: 15
		};

	var totalDistance = 0;
	var distancesByTypeAndMonth = [];

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
			attribution: 'location-history-visualizer is open source and available <a href="https://github.com/theopolisme/location-history-visualizer">on GitHub</a>. Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors.',
			maxZoom: 18,
			minZoom: 2
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
    // Google Analytics event - heatmap upload file
    // ga('send', 'event', 'Heatmap', 'upload', undefined, file.size);

		heat = L.heatLayer( [], heatOptions ).addTo( map );

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
						activityType = activity.activity[0].type;
						confidence = activity.activity[0].confidence;
					}
				});

				if (confidence > 0) {
					var distance = distanceInKmBetweenEarthCoordinates(curLat, curLng, toLat, toLng);
					var date = new Date(parseInt(location.timestampMs));
					var month = date.getFullYear() + '/' + date.getMonth();
					if (!distancesByTypeAndMonth[activityType]) distancesByTypeAndMonth[activityType] = [];
					if (!distancesByTypeAndMonth[activityType][month]) {
						distancesByTypeAndMonth[activityType][month] = distance;
					} else {
						distancesByTypeAndMonth[activityType][month] += distance;
					}
					// totalDistance += distance;
					// console.log('total distance: ' + totalDistance + ' km');
				}

				// Update current position
				curLat = toLat;
				curLng = toLng;
			}
			return oboe.drop;
		} ).done( function () {
			// console.log('total distance: ' + totalDistance + ' km');
			console.log('done');
			console.log(distancesByTypeAndMonth);

			status( 'Generating map...' );
			// heat._latlngs = latlngs;


			// heat.redraw();
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
    // Google Analytics event - heatmap render
    // ga('send', 'event', 'Heatmap', 'render', undefined, numberProcessed);

		console.log('stageThree');

		var $done = $( '#done' );

		// Change tabs :D
		$( 'body' ).removeClass( 'working' );
		$( '#working' ).addClass( 'hidden' );
		$done.removeClass( 'hidden' );

		// Update count
		$( '#numberProcessed' ).text( numberProcessed.toLocaleString() );

    $( '#launch' ).click( function () {
		$( this ).text( 'Launching... ' );
		$( 'body' ).addClass( 'map-active' );
		$done.fadeOut();
		activateControls();
    } );

		function activateControls () {
			var $tileLayer = $( '.leaflet-tile-pane' ),
				$heatmapLayer = $( '.leaflet-heatmap-layer' ),
				originalHeatOptions = $.extend( {}, heatOptions ); // for reset

			// Update values of the dom elements
			function updateInputs () {
				var option;
				for ( option in heatOptions ) {
					if ( heatOptions.hasOwnProperty( option ) ) {
						document.getElementById( option ).value = heatOptions[option];
					}
				}
			}

			updateInputs();

			$( '.control' ).change( function () {
				switch ( this.id ) {
					case 'tileOpacity':
						$tileLayer.css( 'opacity', this.value );
						break;
					case 'heatOpacity':
						$heatmapLayer.css( 'opacity', this.value );
						break;
					default:
						heatOptions[ this.id ] = Number( this.value );
						heat.setOptions( heatOptions );
						break;
				}
			} );

			$( '#reset' ).click( function () {
				$.extend( heatOptions, originalHeatOptions );
				updateInputs();
				heat.setOptions( heatOptions );
				// Reset opacity too
				$heatmapLayer.css( 'opacity', originalHeatOptions.heatOpacity );
				$tileLayer.css( 'opacity', originalHeatOptions.tileOpacity );
			} );
		}
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
