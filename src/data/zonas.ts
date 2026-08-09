// GENERADO por scripts/generar-zonas.mjs — no editar a mano.
//
// Los 1874 distritos del Perú con las coordenadas de su capital. Es lo que
// permite que un aviso tenga siempre ubicación y que quien no da permiso de
// GPS pueda igual ver lo que tiene cerca.
//
// Fuentes: nombres oficiales del INEI 2016 y coordenadas de las capitales.
//
// Formato compacto (id|nombre|provincia|departamento|lat|lng[|3]) que se
// interpreta la primera vez que se usa: como lista de objetos ocupaba más del
// triple. El "3" final marca las pocas zonas que necesitan los tres niveles en
// su etiqueta para no confundirse con otra.

export interface Zona {
  /** Código de ubigeo del INEI (6 dígitos). */
  id: string;
  nombre: string;
  provincia: string;
  departamento: string;
  lat: number;
  lng: number;
  /** Cuántos niveles lleva su etiqueta: 2 (lo normal) o 3 si hace falta. */
  niveles: 2 | 3;
}

const CRUDO = `030101|Abancay|Abancay|Apurímac|-13.62889|-72.88611
020502|Abelardo Pardo Lezameta|Bolognesi|Áncash|-10.29917|-77.14639
040302|Acarí|Caravelí|Arequipa|-15.43556|-74.61639
021402|Acas|Ocros|Áncash|-10.45750|-77.32778
081002|Accha|Paruro|Cusco|-13.97111|-71.83139
051102|Accomarca|Vilcas Huamán|Ayacucho|-13.80056|-73.90417
210202|Achaya|Azángaro|Puno|-15.28472|-70.16111
040502|Achoma|Caylloma|Arequipa|-15.66000|-71.70361
020902|Aco|Corongo|Áncash|-8.52306|-77.87778
120202|Aco|Concepción|Junín|-11.95806|-75.36833
021902|Acobamba|Sihuas|Áncash|-8.32611|-77.58194
090201|Acobamba|Acobamba|Huancavelica|-12.84306|-74.56917
120702|Acobamba|Tarma|Junín|-11.35333|-75.65917
090102|Acobambilla|Huancavelica|Huancavelica|-12.66444|-75.32417
020402|Acochaca|Asunción|Áncash|-9.11472|-77.36833
050102|Acocro|Huamanga|Ayacucho|-13.21861|-74.04194
120402|Acolla|Jauja|Junín|-11.73111|-75.54667
080201|Acomayo|Acomayo|Cusco|-13.91944|-71.68361
020602|Acopampa|Carhuaz|Áncash|-9.29472|-77.62528
080202|Acopia|Acomayo|Cusco|-14.05750|-71.49333
210102|Acora|Puno|Puno|-15.97361|-69.79778
090103|Acoria|Huancavelica|Huancavelica|-12.64250|-74.86167
080203|Acos|Acomayo|Cusco|-13.95111|-71.73806
050103|Acos Vinchos|Huamanga|Ayacucho|-13.11306|-74.10000
090702|Acostambo|Tayacaja|Huancavelica|-12.36556|-75.05500
090703|Acraquia|Tayacaja|Huancavelica|-12.40639|-74.90111
020302|Aczo|Antonio Raymondi|Áncash|-9.15194|-76.98889
130602|Agallpampa|Otuzco|La Libertad|-7.98194|-78.54667
220302|Agua Blanca|El Dorado|San Martín|-6.72528|-76.69528
240302|Aguas Verdes|Zarumilla|Tumbes|-3.48167|-80.24500
120902|Ahuac|Chupaca|Junín|-12.08583|-75.32111
090704|Ahuaycha|Tayacaja|Huancavelica|-12.40778|-74.89111
020201|Aija|Aija|Áncash|-9.78028|-77.61056
210302|Ajoyani|Carabaya|Puno|-14.22944|-70.22361
220902|Alberto Leveau|San Martín|San Martín|-6.66306|-76.28667
040802|Alca|La Uniòn|Arequipa|-15.13417|-72.76500
051002|Alcamenca|Víctor Fajardo|Ayacucho|-13.65722|-74.14722
250305|Alexander Von Humboldt|Padre Abad|Ucayali|-8.82750|-75.05083
021903|Alfonso Ugarte|Sihuas|Áncash|-8.45611|-77.42667
151002|Alis|Yauyos|Lima|-12.28111|-75.78639
151003|Allauca|Yauyos|Lima|-12.59111|-76.03694
220502|Alonso de Alvarado|Lamas|San Martín|-6.35583|-76.77528
220202|Alto Biavo|Bellavista|San Martín|-7.25583|-76.47667
230102|Alto de la Alianza|Tacna|Tacna|-17.99306|-70.24778
211209|Alto Inambari|Sandia|Puno|-14.09000|-69.24333
110202|Alto Laran|Chincha|Ica|-13.44250|-76.08333
160102|Alto Nanay|Maynas|Loreto|-3.88833|-73.69750
080808|Alto Pichigua|Espinar|Cusco|-14.77694|-71.25083
220402|Alto Saposoa|Huallaga|San Martín|-6.76472|-76.81361
040102|Alto Selva Alegre|Arequipa|Arequipa|-16.38000|-71.52111
160502|Alto Tapiche|Requena|Loreto|-6.02556|-74.09417
210103|Amantani|Puno|Puno|-15.65722|-69.71833
100102|Amarilis|Huánuco|Huánuco|-9.94000|-76.24056
020603|Amashca|Carhuaz|Áncash|-9.23917|-77.64667
150802|Ambar|Huaura|Lima|-10.75611|-77.27194
100201|Ambo|Ambo|Huánuco|-10.12917|-76.20444
200502|Amotape|Paita|Piura|-4.88194|-81.01528
211002|Ananea|San Antonio de Putina|Puno|-14.67861|-69.53500
211302|Anapia|Yunguyo|Puno|-16.31389|-68.85278
080302|Ancahuasi|Anta|Cusco|-13.45722|-72.30083
050510|Anchihuay|La Mar|Ayacucho|-12.86361|-73.58250
090302|Anchonga|Angaraes|Huancavelica|-12.91306|-74.69139
050502|Anco|La Mar|Ayacucho|-13.06028|-73.70694
090502|Anco|Churcampa|Huancavelica|-12.68250|-74.58722
030602|Anco_Huallo|Chincheros|Apurímac|-13.52972|-73.67417
150102|Ancón|Lima|Lima|-11.77389|-77.17639
061302|Andabamba|Santa Cruz|Cajamarca|-6.66278|-78.81694
090202|Andabamba|Acobamba|Huancavelica|-12.69361|-74.62333
040402|Andagua|Castilla|Arequipa|-15.49889|-72.35611
030201|Andahuaylas|Andahuaylas|Apurímac|-13.65611|-73.38972
081202|Andahuaylillas|Quispicanchi|Cusco|-13.67333|-71.67778
150902|Andajes|Oyón|Lima|-10.79278|-76.90917
120203|Andamarca|Concepción|Junín|-11.72833|-74.80167
030202|Andarapa|Andahuaylas|Apurímac|-13.52806|-73.36583
040602|Andaray|Condesuyos|Arequipa|-15.79722|-72.86083
090720|Andaymarca|Tayacaja|Huancavelica|-12.31528|-74.63528
160706|Andoas|Datem del Marañón|Loreto|-3.47556|-76.43361
050116|Andrés Avelino Cáceres Dorregaray|Huamanga|Ayacucho|-13.16278|-74.21389
131002|Angasmarca|Santiago de Chuco|La Libertad|-8.13278|-78.05583
060402|Anguia|Chota|Cajamarca|-6.34194|-78.60528
021002|Anra|Huari|Áncash|-9.23472|-76.92639
020604|Anta|Carhuaz|Áncash|-9.35778|-77.59889
080301|Anta|Anta|Cusco|-13.45778|-72.14750
090203|Anta|Acobamba|Huancavelica|-12.81222|-74.63833
030301|Antabamba|Antabamba|Apurímac|-14.36528|-72.87722
210802|Antauta|Melgar|Puno|-14.29972|-70.29222
150702|Antioquia|Huarochirí|Lima|-12.08083|-76.51083
020503|Antonio Raymondi|Bolognesi|Áncash|-10.15722|-77.47056
101104|Aparicio Pomares|Yarowilca|Huánuco|-9.74778|-76.64806
120403|Apata|Jauja|Junín|-11.85528|-75.35444
040401|Aplao|Castilla|Arequipa|-16.07611|-72.49222
051003|Apongo|Víctor Fajardo|Ayacucho|-14.01333|-73.93222
020504|Aquia|Bolognesi|Áncash|-10.07444|-77.14500
150402|Arahuay|Canta|Lima|-11.62139|-76.67028
010202|Aramango|Bagua|Amazonas|-5.41639|-78.43778
100502|Arancay|Huamalíes|Huánuco|-9.17139|-76.75139
210203|Arapa|Azángaro|Puno|-15.13889|-70.11000
200503|Arenal|Paita|Piura|-4.88361|-81.02639
040101|Arequipa|Arequipa|Arequipa|-16.39333|-71.52889
090402|Arma|Castrovirreyna|Huancavelica|-13.12639|-75.54194
090118|Ascensión|Huancavelica|Huancavelica|-12.78528|-74.97694
130201|Ascope|Ascope|La Libertad|-7.71361|-79.10722
150502|Asia|Cañete|Lima|-12.77917|-76.55667
210204|Asillo|Azángaro|Puno|-14.78639|-70.35361
051004|Asquipata|Víctor Fajardo|Ayacucho|-14.05472|-73.90944
010102|Asunción|Chachapoyas|Amazonas|-6.03250|-77.71083
060102|Asunción|Cajamarca|Cajamarca|-7.32472|-78.51861
020605|Ataquero|Carhuaz|Áncash|-9.26222|-77.69167
120404|Ataura|Jauja|Junín|-11.80278|-75.43889
150602|Atavillos Alto|Huaral|Lima|-11.23417|-76.65583
150603|Atavillos Bajo|Huaral|Lima|-11.35194|-76.82556
150103|Ate|Lima|Lima|-12.02639|-76.92139
040303|Atico|Caravelí|Arequipa|-16.20833|-73.62361
040304|Atiquipa|Caravelí|Arequipa|-15.79611|-74.36361
210104|Atuncolla|Puno|Puno|-15.68833|-70.14389
150604|Aucallama|Huaral|Lima|-11.55944|-77.18000
050602|Aucara|Lucanas|Ayacucho|-14.28111|-73.97528
090403|Aurahua|Castrovirreyna|Huancavelica|-13.03472|-75.57028
220802|Awajun|Rioja|San Martín|-5.81611|-77.38278
200201|Ayabaca|Ayabaca|Piura|-4.64056|-79.71528
050101|Ayacucho|Huamanga|Ayacucho|-13.16028|-74.22528
050402|Ayahuanco|Huanta|Ayacucho|-12.59389|-74.33083
210303|Ayapata|Carabaya|Puno|-13.77667|-70.32278
090602|Ayavi|Huaytará|Huancavelica|-13.70306|-75.35111
151004|Ayaviri|Yauyos|Lima|-12.38250|-76.13694
210801|Ayaviri|Melgar|Puno|-14.88167|-70.58944
050503|Ayna|La Mar|Ayacucho|-12.62417|-73.78944
040403|Ayo|Castilla|Arequipa|-15.68278|-72.27194
151005|Azángaro|Yauyos|Lima|-13.00000|-75.83722
210201|Azángaro|Azángaro|Puno|-14.90806|-70.19556
010201|Bagua|Bagua|Amazonas|-5.63889|-78.53111
010701|Bagua Grande|Utcubamba|Amazonas|-5.75472|-78.44278
220203|Bajo Biavo|Bellavista|San Martín|-7.10167|-76.47194
160202|Balsapuerto|Alto Amazonas|Loreto|-5.83333|-76.55972
010103|Balsas|Chachapoyas|Amazonas|-6.83583|-78.01972
060701|Bambamarca|Hualgayoc|Cajamarca|-6.67972|-78.51889
130302|Bambamarca|Bolívar|La Libertad|-7.43972|-77.69306
020903|Bambas|Corongo|Áncash|-8.60250|-77.99694
101002|Baños|Lauricocha|Huánuco|-10.07639|-76.73556
150201|Barranca|Barranca|Lima|-10.75333|-77.76500
160701|Barranca|Datem del Marañón|Loreto|-4.83111|-76.55500
150104|Barranco|Lima|Lima|-12.14917|-77.02167
220503|Barranquita|Lamas|San Martín|-6.25222|-76.03333
050902|Belén|Sucre|Ayacucho|-13.80889|-73.75750
160112|Belén|Maynas|Loreto|-3.76917|-73.26000
040305|Bella Unión|Caravelí|Arequipa|-15.45056|-74.65833
060802|Bellavista|Jaén|Cajamarca|-5.66778|-78.67722
070102|Bellavista|Prov. Const. del Callao|Callao|-12.06250|-77.12917
200602|Bellavista|Sullana|Piura|-4.89000|-80.68028
220201|Bellavista|Bellavista|San Martín|-7.05222|-76.58972
200802|Bellavista de la Unión|Sechura|Piura|-5.44028|-80.75500
200803|Bernal|Sechura|Piura|-5.45889|-80.74194
061102|Bolívar|San Miguel|Cajamarca|-6.97694|-79.17806
130301|Bolívar|Bolívar|La Libertad|-7.15389|-77.70222
021502|Bolognesi|Pallasca|Áncash|-8.35056|-78.05056
150105|Breña|Lima|Lima|-12.05889|-77.04611
020802|Buena Vista Alta|Casma|Áncash|-9.43250|-78.20694
200402|Buenos Aires|Morropón|Piura|-5.26694|-79.96694
220702|Buenos Aires|Picota|San Martín|-6.79167|-76.32778
130802|Buldibuyo|Pataz|La Libertad|-8.12694|-77.39528
021501|Cabana|Pallasca|Áncash|-8.39306|-78.00889
050603|Cabana|Lucanas|Ayacucho|-14.28833|-73.96722
211102|Cabana|San Román|Puno|-15.64917|-70.32194
040503|Cabanaconde|Caylloma|Arequipa|-15.62000|-71.98194
210702|Cabanilla|Lampa|Puno|-15.62028|-70.34556
211103|Cabanillas|San Román|Puno|-15.64444|-70.35389
220903|Cacatachi|San Martín|San Martín|-6.46194|-76.45139
021802|Cáceres del Perú|Santa|Áncash|-9.01306|-78.13806
060202|Cachachi|Cajabamba|Cajamarca|-7.44889|-78.26889
131003|Cachicadan|Santiago de Chuco|La Libertad|-8.09444|-78.14889
080303|Cachimayo|Anta|Cusco|-13.47778|-72.06889
151006|Cacra|Yauyos|Lima|-12.81250|-75.78306
101102|Cahuac|Yarowilca|Huánuco|-9.85278|-76.63056
040306|Cahuacho|Caravelí|Arequipa|-15.50278|-73.47972
160702|Cahuapanas|Datem del Marañón|Loreto|-5.24917|-77.04139
081102|Caicay|Paucartambo|Cusco|-13.59722|-71.69667
230202|Cairani|Candarave|Tacna|-17.28528|-70.36361
090204|Caja|Acobamba|Huancavelica|-12.91722|-74.46583
060201|Cajabamba|Cajabamba|Cajamarca|-7.62306|-78.04611
020505|Cajacay|Bolognesi|Áncash|-10.15528|-77.43972
060101|Cajamarca|Cajamarca|Cajamarca|-7.15472|-78.51083
021403|Cajamarquilla|Ocros|Áncash|-10.35417|-77.19917
010702|Cajaruro|Utcubamba|Amazonas|-5.73639|-78.42667
150301|Cajatambo|Cajatambo|Lima|-10.47306|-76.99306
021003|Cajay|Huari|Áncash|-9.32583|-77.15750
130502|Calamarca|Julcán|La Libertad|-8.17000|-78.41222
230103|Calana|Tacna|Tacna|-17.94333|-70.18833
150503|Calango|Cañete|Lima|-12.52639|-76.54361
210703|Calapuja|Lampa|Puno|-15.31056|-70.22167
080401|Calca|Calca|Cusco|-13.32111|-71.95556
150803|Caleta de Carquin|Huaura|Lima|-11.09167|-77.62833
150703|Callahuanca|Huarochirí|Lima|-11.82639|-76.61889
040504|Callalli|Caylloma|Arequipa|-15.50639|-71.44472
090303|Callanmarca|Angaraes|Huancavelica|-12.86667|-74.62333
070101|Callao|Prov. Const. del Callao|Callao|-12.06306|-77.14694
060602|Callayuc|Cutervo|Cajamarca|-6.18111|-78.91056
250101|Calleria|Coronel Portillo|Ucayali|-8.36806|-74.54333
061103|Calquis|San Miguel|Cajamarca|-6.98028|-78.85000
220102|Calzada|Moyobamba|San Martín|-6.03028|-77.06667
040201|Camaná|Camaná|Arequipa|-16.62472|-72.71139
081203|Camanti|Quispicanchi|Cusco|-13.23139|-70.75444
230203|Camilaca|Candarave|Tacna|-17.24250|-70.38806
210205|Caminaca|Azángaro|Puno|-15.32472|-70.07278
220602|Campanilla|Mariscal Cáceres|San Martín|-7.48306|-76.64972
010502|Camporredondo|Luya|Amazonas|-6.21333|-78.32000
250102|Campoverde|Coronel Portillo|Ucayali|-8.47194|-74.80528
051005|Canaria|Víctor Fajardo|Ayacucho|-13.92306|-73.90472
050409|Canayre|Huanta|Ayacucho|-12.28222|-74.02306
100402|Canchabamba|Huacaybamba|Huánuco|-8.88472|-77.12306
200302|Canchaque|Huancabamba|Piura|-5.37583|-79.60556
120405|Canchayllo|Jauja|Junín|-11.80222|-75.71806
230201|Candarave|Candarave|Tacna|-17.26806|-70.25028
050201|Cangallo|Cangallo|Ayacucho|-13.62917|-74.14389
020506|Canis|Bolognesi|Áncash|-10.33889|-77.16889
240203|Canoas de Punta Sal|Contralmirante Villar|Tumbes|-3.95056|-80.94000
150401|Canta|Canta|Lima|-11.46722|-76.62444
140202|Cañaris|Ferreñafe|Lambayeque|-6.04611|-79.26528
210105|Capachica|Puno|Puno|-15.64167|-69.83083
080702|Capacmarca|Chumbivilcas|Cusco|-14.00722|-72.00250
030402|Capaya|Aymaraes|Apurímac|-14.11778|-73.32111
210502|Capazo|El Collao|Puno|-17.18389|-69.74444
160503|Capelo|Requena|Loreto|-5.40528|-74.15778
090404|Capillas|Castrovirreyna|Huancavelica|-13.29306|-75.54250
130503|Carabamba|Julcán|La Libertad|-8.11250|-78.60750
150106|Carabayllo|Lima|Lima|-11.89028|-77.02694
211104|Caracoto|San Román|Puno|-15.56750|-70.10250
150704|Carampoma|Huarochirí|Lima|-11.65639|-76.51639
151007|Carania|Yauyos|Lima|-12.34556|-75.86944
050302|Carapo|Huanca Sancos|Ayacucho|-13.83750|-74.31556
040301|Caravelí|Caravelí|Arequipa|-15.77250|-73.36583
030403|Caraybamba|Aymaraes|Apurímac|-14.37806|-73.16083
021201|Caraz|Huaylas|Áncash|-9.04861|-77.80472
120104|Carhuacallanga|Huancayo|Junín|-12.35500|-75.20056
120502|Carhuamayo|Junín|Junín|-10.92278|-76.05778
051103|Carhuanca|Vilcas Huamán|Ayacucho|-13.74250|-73.78722
021404|Carhuapampa|Ocros|Áncash|-10.49750|-77.24278
020601|Carhuaz|Carhuaz|Áncash|-9.28139|-77.64667
050104|Carmen Alto|Huamanga|Ayacucho|-13.17944|-74.22056
070103|Carmen de la Legua Reynoso|Prov. Const. del Callao|Callao|-12.03944|-77.09028
050604|Carmen Salcedo|Lucanas|Ayacucho|-14.38778|-73.96194
180102|Carumas|Mariscal Nieto|Moquegua|-16.80917|-70.69472
130208|Casa Grande|Ascope|La Libertad|-7.74528|-79.18806
021302|Casca|Mariscal Luzuriaga|Áncash|-8.85556|-77.39861
022002|Cascapara|Yungay|Áncash|-9.22639|-77.71722
131101|Cascas|Gran Chimú|La Libertad|-7.47944|-78.81972
021904|Cashapampa|Sihuas|Áncash|-8.56111|-77.65306
240202|Casitas|Contralmirante Villar|Tumbes|-3.94222|-80.65111
020801|Casma|Casma|Áncash|-9.47583|-78.30639
220703|Caspisapa|Picota|San Martín|-6.95639|-76.41861
200104|Castilla|Piura|Piura|-5.20139|-80.62278
100608|Castillo Grande|Leoncio Prado|Huánuco|-9.27972|-76.00889
090401|Castrovirreyna|Castrovirreyna|Huancavelica|-13.28333|-75.31833
021702|Catac|Recuay|Áncash|-9.80167|-77.43056
200105|Catacaos|Piura|Piura|-5.26722|-80.67250
061303|Catache|Santa Cruz|Cajamarca|-6.67361|-79.03278
151008|Catahuasi|Yauyos|Lima|-12.79944|-75.89139
061104|Catilluc|San Miguel|Cajamarca|-6.80167|-78.77917
150903|Caujul|Oyón|Lima|-10.80583|-76.97917
140116|Cayalti|Chiclayo|Lambayeque|-6.89167|-79.56222
051006|Cayara|Víctor Fajardo|Ayacucho|-13.79528|-73.98861
040603|Cayarani|Condesuyos|Arequipa|-14.67194|-72.02194
040505|Caylloma|Caylloma|Arequipa|-15.18889|-71.77333
040103|Cayma|Arequipa|Arequipa|-16.36250|-71.54417
100202|Cayna|Ambo|Huánuco|-10.27250|-76.38833
220504|Caynarachi|Lamas|San Martín|-6.33083|-76.28417
081003|Ccapi|Paruro|Cusco|-13.85306|-72.08250
081204|Ccarhuayo|Quispicanchi|Cusco|-13.59528|-71.39972
081205|Ccatca|Quispicanchi|Cusco|-13.60528|-71.56361
090304|Ccochaccasa|Angaraes|Huancavelica|-12.92528|-74.77028
080102|Ccorca|Cusco|Cusco|-13.58472|-72.05917
060301|Celendín|Celendín|Cajamarca|-6.86694|-78.14306
150504|Cerro Azul|Cañete|Lima|-13.02500|-76.47889
040104|Cerro Colorado|Arequipa|Arequipa|-16.37639|-71.56083
050412|Chaca|Huanta|Ayacucho|-12.78417|-74.20583
101103|Chacabamba|Yarowilca|Huánuco|-9.90028|-76.61111
120802|Chacapalpa|Yauli|Junín|-11.73278|-75.75556
120105|Chacapampa|Huancayo|Junín|-12.34500|-75.24750
020401|Chacas|Asunción|Áncash|-9.16222|-77.36583
190202|Chacayan|Daniel Alcides Carrión|Pasco|-10.43444|-76.43722
020303|Chaccho|Antonio Raymondi|Áncash|-9.05972|-77.05833
010101|Chachapoyas|Chachapoyas|Amazonas|-6.22944|-77.87278
040404|Chachas|Castilla|Arequipa|-15.50139|-72.27056
150107|Chaclacayo|Lima|Lima|-11.97528|-76.76889
030102|Chacoche|Abancay|Apurímac|-13.94111|-72.99111
060403|Chadin|Chota|Cajamarca|-6.47139|-78.41944
100802|Chaglla|Pachitea|Huánuco|-9.84472|-75.90278
040307|Chala|Caravelí|Arequipa|-15.86556|-74.24750
200403|Chalaco|Morropón|Piura|-5.04111|-79.79556
060419|Chalamarca|Chota|Cajamarca|-6.50306|-78.47972
050903|Chalcos|Sucre|Ayacucho|-13.84806|-73.75417
030401|Chalhuanca|Aymaraes|Apurímac|-14.29444|-73.24472
081103|Challabamba|Paucartambo|Cusco|-13.21500|-71.64861
030506|Challhuahuacho|Cotabambas|Apurímac|-14.11861|-72.24667
080703|Chamaca|Chumbivilcas|Cusco|-14.30250|-71.85222
120204|Chambara|Concepción|Junín|-12.02722|-75.37528
061002|Chancay|San Marcos|Cajamarca|-7.38806|-78.12333
150605|Chancay|Huaral|Lima|-11.56306|-77.27056
061304|Chancaybaños|Santa Cruz|Cajamarca|-6.57611|-78.86750
120301|Chanchamayo|Chanchamayo|Junín|-11.05667|-75.32750
110302|Changuillo|Nasca|Ica|-14.66472|-75.22250
131202|Chao|Virú|La Libertad|-8.54056|-78.67889
040308|Chaparra|Caravelí|Arequipa|-15.80528|-73.96694
030404|Chapimarca|Aymaraes|Apurímac|-13.97500|-73.06500
040105|Characato|Arequipa|Arequipa|-16.46861|-71.48444
130604|Charat|Otuzco|La Libertad|-7.82389|-78.44806
040803|Charcana|La Uniòn|Arequipa|-15.24056|-73.07056
190101|Chaupimarca|Pasco|Pasco|-10.68250|-76.25694
110203|Chavin|Chincha|Ica|-13.07639|-75.91306
021004|Chavin de Huantar|Huari|Áncash|-9.58861|-77.17833
100503|Chavín de Pariarca|Huamalíes|Huánuco|-9.42306|-76.77139
101101|Chavinillo|Yarowilca|Huánuco|-9.85889|-76.60889
050605|Chaviña|Lucanas|Ayacucho|-14.97944|-73.83750
220904|Chazuta|San Martín|San Martín|-6.57361|-76.13778
080602|Checacupe|Canchis|Cusco|-14.02528|-71.45389
080502|Checca|Canas|Cusco|-14.47333|-71.39472
150804|Checras|Huaura|Lima|-10.91806|-76.82556
130401|Chepén|Chepén|La Libertad|-7.22750|-79.42944
060103|Chetilla|Cajamarca|Cajamarca|-7.14694|-78.67333
010104|Cheto|Chachapoyas|Amazonas|-6.25556|-77.70083
030203|Chiara|Andahuaylas|Apurímac|-13.86722|-73.66889
050105|Chiara|Huamanga|Ayacucho|-13.27278|-74.20583
130202|Chicama|Ascope|La Libertad|-7.84250|-79.14417
120106|Chicche|Huancayo|Junín|-12.29611|-75.29861
040604|Chichas|Condesuyos|Arequipa|-15.54778|-72.91861
150705|Chicla|Huarochirí|Lima|-11.70639|-76.26806
140101|Chiclayo|Chiclayo|Lambayeque|-6.76694|-79.85056
040106|Chiguata|Arequipa|Arequipa|-16.40361|-71.39167
060404|Chiguirip|Chota|Cajamarca|-6.42833|-78.72139
120107|Chilca|Huancayo|Junín|-12.08667|-75.20833
150505|Chilca|Cañete|Lima|-12.51806|-76.73806
050504|Chilcas|La Mar|Ayacucho|-13.17111|-73.90639
040405|Chilcaymarca|Castilla|Arequipa|-15.28611|-72.37667
050904|Chilcayoc|Sucre|Ayacucho|-13.88306|-73.72722
060502|Chilete|Contumazá|Cajamarca|-7.22139|-78.83972
010105|Chiliquin|Chachapoyas|Amazonas|-6.07833|-77.73750
130803|Chillia|Pataz|La Libertad|-8.12444|-77.51500
060405|Chimban|Chota|Cajamarca|-6.25167|-78.47889
021801|Chimbote|Santa|Áncash|-9.04167|-78.60778
110201|Chincha Alta|Chincha|Ica|-13.41833|-76.13250
110204|Chincha Baja|Chincha|Ica|-13.45944|-76.16556
100103|Chinchao|Huánuco|Huánuco|-9.80167|-76.07083
080304|Chinchaypujio|Anta|Cusco|-13.62972|-72.23306
081302|Chinchero|Urubamba|Cusco|-13.39194|-72.04889
030601|Chincheros|Chincheros|Apurímac|-13.51833|-73.72278
090503|Chinchihuasi|Churcampa|Huancavelica|-12.51694|-74.54583
090305|Chincho|Angaraes|Huancavelica|-12.97278|-74.36722
021905|Chingalpo|Sihuas|Áncash|-8.33861|-77.59750
020304|Chingas|Antonio Raymondi|Áncash|-9.11861|-76.99194
050606|Chipao|Lucanas|Ayacucho|-14.36583|-73.87611
220905|Chipurana|San Martín|San Martín|-6.35417|-75.74139
020501|Chiquian|Bolognesi|Áncash|-10.15194|-77.15639
010602|Chirimoto|Rodríguez de Mendoza|Amazonas|-6.52306|-77.44250
060902|Chirinos|San Ignacio|Cajamarca|-5.30583|-78.89833
010302|Chisquilla|Bongará|Amazonas|-5.89750|-77.78611
040501|Chivay|Caylloma|Arequipa|-15.64028|-71.60361
140302|Chochope|Lambayeque|Lambayeque|-6.15778|-79.64778
040406|Choco|Castilla|Arequipa|-15.57667|-72.12889
130203|Chocope|Ascope|La Libertad|-7.79139|-79.22306
151009|Chocos|Yauyos|Lima|-12.91444|-75.86278
180202|Chojata|General Sánchez Cerro|Moquegua|-16.38833|-70.73028
100702|Cholon|Marañón|Huánuco|-8.65583|-76.87528
120108|Chongos Alto|Huancayo|Junín|-12.31167|-75.28917
120903|Chongos Bajo|Chupaca|Junín|-12.13389|-75.26806
140102|Chongoyape|Chiclayo|Lambayeque|-6.64306|-79.38528
190302|Chontabamba|Oxapampa|Pasco|-10.60222|-75.43889
060803|Chontali|Jaén|Cajamarca|-5.64611|-79.08833
101108|Choras|Yarowilca|Huánuco|-9.91028|-76.60583
060406|Choropampa|Chota|Cajamarca|-6.37111|-78.41194
060603|Choros|Cutervo|Cajamarca|-5.90000|-78.69389
150108|Chorrillos|Lima|Lima|-12.17694|-77.01639
060401|Chota|Chota|Cajamarca|-6.55972|-78.64694
210106|Chucuito|Puno|Puno|-15.89472|-69.88944
130902|Chugay|Sánchez Carrión|La Libertad|-7.78194|-77.86833
060702|Chugur|Hualgayoc|Cajamarca|-6.67083|-78.73833
200401|Chulucanas|Morropón|Piura|-5.09722|-80.16028
050702|Chumpi|Parinacochas|Ayacucho|-15.09444|-73.74806
060302|Chumuch|Celendín|Cajamarca|-6.60278|-78.20028
050505|Chungui|La Mar|Ayacucho|-13.22222|-73.62167
210206|Chupa|Azángaro|Puno|-15.10583|-69.98722
120901|Chupaca|Chupaca|Junín|-12.05778|-75.28944
090405|Chupamarca|Castrovirreyna|Huancavelica|-13.03722|-75.60833
120111|Chupuro|Huancayo|Junín|-12.15556|-75.24556
010106|Chuquibamba|Chachapoyas|Amazonas|-6.93500|-77.85417
040601|Chuquibamba|Condesuyos|Arequipa|-15.83944|-72.65167
030701|Chuquibambilla|Grau|Apurímac|-14.10500|-72.70778
100307|Chuquis|Dos de Mayo|Huánuco|-9.67639|-76.70528
090501|Churcampa|Churcampa|Huancavelica|-12.73917|-74.38722
100104|Churubamba|Huánuco|Huánuco|-9.82611|-76.13389
010303|Churuja|Bongará|Amazonas|-6.01944|-77.95194
050202|Chuschi|Cangallo|Ayacucho|-13.58500|-74.35167
150109|Cieneguilla|Lima|Lima|-12.12028|-76.81417
030103|Circa|Abancay|Apurímac|-13.87833|-72.87583
230104|Ciudad Nueva|Tacna|Tacna|-17.98194|-70.23806
180203|Coalaque|General Sánchez Cerro|Moquegua|-16.64889|-71.02167
210304|Coasa|Carabaya|Puno|-13.98917|-70.01583
210107|Coata|Puno|Puno|-15.57139|-69.95056
150506|Coayllo|Cañete|Lima|-12.72722|-76.46028
010503|Cocabamba|Luya|Amazonas|-6.61417|-78.00500
040702|Cocachacra|Islay|Arequipa|-17.09111|-71.77389
090406|Cocas|Castrovirreyna|Huancavelica|-13.27583|-75.37278
020102|Cochabamba|Huaraz|Áncash|-9.49500|-77.85944
060407|Cochabamba|Chota|Cajamarca|-6.47389|-78.88583
100403|Cochabamba|Huacaybamba|Huánuco|-9.09528|-76.83639
010603|Cochamal|Rodríguez de Mendoza|Amazonas|-6.40750|-77.58528
150904|Cochamarca|Oyón|Lima|-10.86333|-77.12889
021102|Cochapeti|Huarmey|Áncash|-9.98722|-77.64611
030603|Cocharcas|Chincheros|Apurímac|-13.61056|-73.74139
021405|Cochas|Ocros|Áncash|-10.53667|-77.42278
120205|Cochas|Concepción|Junín|-11.66000|-75.10222
151010|Cochas|Yauyos|Lima|-12.29417|-76.15750
130903|Cochorco|Sánchez Carrión|La Libertad|-7.80639|-77.71750
100902|Codo del Pozuzo|Puerto Inca|Huánuco|-9.67000|-75.46250
021803|Coishco|Santa|Áncash|-9.02306|-78.61611
210602|Cojata|Huancané|Puno|-15.01528|-69.36556
200504|Colan|Paita|Piura|-4.90056|-81.05639
060804|Colasay|Jaén|Cajamarca|-5.97861|-79.06861
051007|Colca|Víctor Fajardo|Ayacucho|-13.71250|-74.03389
120112|Colca|Huancayo|Junín|-12.31750|-75.22222
020103|Colcabamba|Huaraz|Áncash|-9.59472|-77.80861
030405|Colcabamba|Aymaraes|Apurímac|-14.00639|-73.25417
090705|Colcabamba|Tayacaja|Huancavelica|-12.40917|-74.67944
010504|Colcamar|Luya|Amazonas|-6.29944|-77.97306
081004|Colcha|Paruro|Cusco|-13.85194|-71.80333
151011|Colonia|Yauyos|Lima|-12.63389|-75.89028
100203|Colpas|Ambo|Huánuco|-10.26833|-76.41528
080704|Colquemarca|Chumbivilcas|Cusco|-14.28528|-72.04000
081104|Colquepata|Paucartambo|Cusco|-13.36028|-71.67361
020507|Colquioc|Bolognesi|Áncash|-10.31222|-77.61528
050802|Colta|Pàucar del Sara Sara|Ayacucho|-15.16278|-73.29389
020803|Comandante Noel|Casma|Áncash|-9.46250|-78.38472
120206|Comas|Concepción|Junín|-11.71778|-75.08167
150110|Comas|Lima|Lima|-11.95722|-77.04944
080603|Combapata|Canchis|Cusco|-14.10194|-71.43000
090104|Conayca|Huancavelica|Huancavelica|-12.52000|-75.00667
051104|Concepción|Vilcas Huamán|Ayacucho|-13.53250|-73.87528
120201|Concepción|Concepción|Junín|-11.91889|-75.31250
100204|Conchamarca|Ambo|Huánuco|-10.03583|-76.21694
060408|Conchan|Chota|Cajamarca|-6.44472|-78.65583
021503|Conchucos|Pallasca|Áncash|-8.26861|-77.85278
060203|Condebamba|Cajabamba|Cajamarca|-7.57361|-78.06972
130303|Condormarca|Bolívar|La Libertad|-7.54667|-77.59972
080802|Condoroma|Espinar|Cusco|-15.30056|-71.13833
210505|Conduriri|El Collao|Puno|-16.62194|-69.70861
090306|Congalla|Angaraes|Huancavelica|-12.95583|-74.49222
021406|Congas|Ocros|Áncash|-10.33750|-77.44278
010505|Conila|Luya|Amazonas|-6.15917|-78.14194
210902|Conima|Moho|Puno|-15.45778|-69.43778
190308|Constitución|Oxapampa|Pasco|-9.85639|-75.01694
160601|Contamana|Ucayali|Loreto|-7.35056|-75.00972
060501|Contumazá|Contumazá|Cajamarca|-7.36667|-78.80528
150302|Copa|Cajatambo|Lima|-10.38639|-77.07889
010203|Copallin|Bagua|Amazonas|-5.67500|-78.42306
211303|Copani|Yunguyo|Puno|-16.40000|-69.04028
040506|Coporaque|Caylloma|Arequipa|-15.62722|-71.64611
080803|Coporaque|Espinar|Cusco|-14.80028|-71.53167
050701|Coracora|Parinacochas|Ayacucho|-15.01694|-73.78139
210305|Corani|Carabaya|Puno|-13.86861|-70.60444
050803|Corculla|Pàucar del Sara Sara|Ayacucho|-15.26278|-73.20028
090603|Córdova|Huaytará|Huancavelica|-14.04083|-75.18500
020202|Coris|Aija|Áncash|-9.82056|-77.71944
050703|Coronel Castañeda|Parinacochas|Ayacucho|-14.80722|-73.28222
230110|Coronel Gregorio Albarracín Lanchipa|Tacna|Tacna|-18.04306|-70.25167
020901|Corongo|Corongo|Áncash|-8.57083|-77.89889
010304|Corosha|Bongará|Amazonas|-5.84333|-77.82250
240102|Corrales|Tumbes|Tumbes|-3.60139|-80.48056
060303|Cortegana|Celendín|Cajamarca|-6.51306|-78.32889
090511|Cosme|Churcampa|Huancavelica|-12.57333|-74.65833
060104|Cospan|Cajamarca|Cajamarca|-7.42722|-78.54222
030502|Cotabambas|Cotabambas|Apurímac|-13.74556|-72.35500
040801|Cotahuasi|La Uniòn|Arequipa|-15.21278|-72.88944
021703|Cotaparaco|Recuay|Áncash|-9.99333|-77.58806
030406|Cotaruse|Aymaraes|Apurímac|-14.41583|-73.20500
120602|Coviriali|Satipo|Junín|-11.29139|-74.62750
080402|Coya|Calca|Cusco|-13.38639|-71.89833
030503|Coyllurqui|Cotabambas|Apurímac|-13.83694|-72.43222
200804|Cristo Nos Valga|Sechura|Piura|-5.49306|-80.74111
210306|Crucero|Carabaya|Puno|-14.36167|-70.02361
180103|Cuchumbaya|Mariscal Nieto|Moquegua|-16.75083|-70.68611
090105|Cuenca|Huancavelica|Huancavelica|-12.43306|-75.03889
150706|Cuenca|Huarochirí|Lima|-12.13222|-76.43528
010305|Cuispes|Bongará|Amazonas|-5.92833|-77.94611
060604|Cujillo|Cutervo|Cajamarca|-6.10694|-78.57389
021103|Culebras|Huarmey|Áncash|-9.95028|-78.22222
120113|Cullhuas|Huancayo|Junín|-12.22056|-75.16694
010703|Cumba|Utcubamba|Amazonas|-5.93556|-78.66361
220505|Cuñumbuqui|Lamas|San Martín|-6.51056|-76.48167
210803|Cupi|Melgar|Puno|-14.90500|-70.86667
060503|Cupisnique|Contumazá|Cajamarca|-7.34889|-79.02972
200107|Cura Mori|Piura|Piura|-5.32361|-80.66556
030104|Curahuasi|Abancay|Apurímac|-13.54139|-72.69611
030714|Curasco|Grau|Apurímac|-14.06194|-72.56778
130904|Curgos|Sánchez Carrión|La Libertad|-7.86000|-77.94389
230204|Curibaya|Candarave|Tacna|-17.38139|-70.33472
120406|Curicaca|Jauja|Junín|-11.78528|-75.67500
250303|Curimana|Padre Abad|Ucayali|-8.43333|-75.14778
030702|Curpahuasi|Grau|Apurímac|-14.06333|-72.67083
020904|Cusca|Corongo|Áncash|-8.51333|-77.86472
080101|Cusco|Cusco|Cusco|-13.51917|-71.97667
081206|Cusipata|Quispicanchi|Cusco|-13.90694|-71.50250
060601|Cutervo|Cutervo|Cajamarca|-6.37722|-78.81806
211304|Cuturapi|Yunguyo|Puno|-16.27056|-69.17694
211202|Cuyocuyo|Sandia|Puno|-14.47028|-69.53722
100602|Daniel Alomía Robles|Leoncio Prado|Huánuco|-9.18778|-75.95472
090706|Daniel Hernández|Tayacaja|Huancavelica|-12.38944|-74.85917
040703|Dean Valdivia|Islay|Arequipa|-17.14500|-71.82667
210402|Desaguadero|Chucuito|Puno|-16.56444|-69.03944
080902|Echarate|La Convención|Cusco|-12.76806|-72.57611
061003|Eduardo Villanueva|San Marcos|Cajamarca|-7.46444|-78.13000
150111|El Agustino|Lima|Lima|-12.04833|-77.00056
180302|El Algarrobal|Ilo|Moquegua|-17.62278|-71.26833
200702|El Alto|Talara|Piura|-4.26861|-81.22139
090504|El Carmen|Churcampa|Huancavelica|-12.72694|-74.48083
110205|El Carmen|Chincha|Ica|-13.49944|-76.05778
200303|El Carmen de la Frontera|Huancabamba|Piura|-5.14833|-79.42833
010402|El Cenepa|Condorcanqui|Amazonas|-4.45556|-78.15889
220403|El Eslabón|Huallaga|San Martín|-7.02167|-76.72333
110303|El Ingenio|Nasca|Ica|-14.64528|-75.05833
120407|El Mantaro|Jauja|Junín|-11.82222|-75.39194
010704|El Milagro|Utcubamba|Amazonas|-5.63778|-78.55833
030302|El Oro|Antabamba|Apurímac|-14.20889|-73.05833
010204|El Parco|Bagua|Amazonas|-5.62500|-78.47528
030610|El Porvenir|Chincheros|Apurímac|-13.39667|-73.59333
130102|El Porvenir|Trujillo|La Libertad|-8.08806|-78.99778
220906|El Porvenir|San Martín|San Martín|-6.21167|-75.80083
061105|El Prado|San Miguel|Cajamarca|-7.03361|-79.01083
200108|El Tallan|Piura|Piura|-5.40917|-80.68111
120114|El Tambo|Huancayo|Junín|-12.05028|-75.22139
021303|Eleazar Guzmán Barron|Mariscal Luzuriaga|Áncash|-8.90222|-77.24389
220803|Elías Soplin Vargas|Rioja|San Martín|-5.98722|-77.27806
160504|Emilio San Martín|Requena|Loreto|-5.79361|-74.28389
060105|Encañada|Cajamarca|Cajamarca|-7.08694|-78.34444
080801|Espinar|Espinar|Cusco|-14.79306|-71.41333
230403|Estique|Tarata|Tacna|-17.54194|-70.01833
230404|Estique-Pampa|Tarata|Tacna|-17.53861|-70.03139
140103|Eten|Chiclayo|Lambayeque|-6.90694|-79.86250
140104|Eten Puerto|Chiclayo|Lambayeque|-6.92556|-79.86611
160103|Fernando Lores|Maynas|Loreto|-4.00167|-73.15694
140201|Ferreñafe|Ferreñafe|Lambayeque|-6.63889|-79.78833
021304|Fidel Olivas Escudero|Mariscal Luzuriaga|Áncash|-8.80611|-77.27972
170202|Fitzcarrald|Manu|Madre de Dios|-12.26528|-70.91000
130103|Florencia de Mora|Trujillo|La Libertad|-8.08278|-79.02333
010306|Florida|Bongará|Amazonas|-5.82611|-77.96944
200202|Frias|Ayabaca|Piura|-4.93167|-79.94750
030703|Gamarra|Grau|Apurímac|-13.87167|-72.50833
150303|Gorgor|Cajatambo|Lima|-10.62111|-77.04139
190203|Goyllarisquizga|Daniel Alcides Carrión|Pasco|-10.47306|-76.40833
010107|Granada|Chachapoyas|Amazonas|-6.10639|-77.62861
061004|Gregorio Pita|San Marcos|Cajamarca|-7.27361|-78.16000
110206|Grocio Prado|Chincha|Ica|-13.39806|-76.15611
130702|Guadalupe|Pacasmayo|La Libertad|-7.24361|-79.47028
131203|Guadalupito|Virú|La Libertad|-8.95167|-78.62472
060504|Guzmango|Contumazá|Cajamarca|-7.38389|-78.89611
220103|Habana|Moyobamba|San Martín|-6.07972|-77.09139
030504|Haquira|Cotabambas|Apurímac|-14.21417|-72.18889
100603|Hermílio Valdizan|Leoncio Prado|Huánuco|-9.20556|-75.83583
230402|Héroes Albarracín|Tarata|Tacna|-17.48056|-70.12306
120207|Heroínas Toledo|Concepción|Junín|-11.83556|-75.29083
151012|Hongos|Yauyos|Lima|-12.81083|-75.76528
100903|Honoria|Puerto Inca|Huánuco|-8.76944|-74.70917
060805|Huabal|Jaén|Cajamarca|-5.61250|-78.89972
050607|Huac-Huas|Lucanas|Ayacucho|-14.13167|-74.94222
021005|Huacachi|Huari|Áncash|-9.31556|-76.93861
050905|Huacaña|Sucre|Ayacucho|-14.17222|-73.88639
100205|Huacar|Ambo|Huánuco|-10.15944|-76.23667
021504|Huacaschuque|Pallasca|Áncash|-8.30639|-78.00472
100401|Huacaybamba|Huacaybamba|Huánuco|-9.03806|-76.95250
030604|Huaccana|Chincheros|Apurímac|-13.38806|-73.68917
021006|Huacchis|Huari|Áncash|-9.20056|-76.78694
120904|Huachac|Chupaca|Junín|-12.02056|-75.34111
021007|Huachis|Huari|Áncash|-9.41000|-77.10000
150801|Huacho|Huaura|Lima|-11.10806|-77.61028
090106|Huachocolpa|Huancavelica|Huancavelica|-13.03194|-74.94694
090707|Huachocolpa|Tayacaja|Huancavelica|-12.04833|-74.59472
190102|Huachon|Pasco|Pasco|-10.63639|-75.95111
090407|Huachos|Castrovirreyna|Huancavelica|-13.21972|-75.53389
150707|Huachupampa|Huarochirí|Lima|-11.72111|-76.58861
020203|Huacllan|Aija|Áncash|-9.79806|-77.67528
100701|Huacrachuco|Marañón|Huánuco|-8.60472|-77.14917
120116|Huacrapuquio|Huancayo|Junín|-12.17111|-75.22083
210403|Huacullani|Chucuito|Puno|-16.63056|-69.32194
060703|Hualgayoc|Hualgayoc|Cajamarca|-6.76472|-78.60806
120117|Hualhuas|Huancayo|Junín|-11.97139|-75.25083
051010|Hualla|Víctor Fajardo|Ayacucho|-13.85000|-73.95083
220204|Huallaga|Bellavista|San Martín|-7.13111|-76.64861
020508|Huallanca|Bolognesi|Áncash|-9.89944|-76.94167
021202|Huallanca|Huaylas|Áncash|-8.81889|-77.86306
150805|Hualmay|Huaura|Lima|-11.09667|-77.61306
130901|Huamachuco|Sánchez Carrión|La Libertad|-7.81111|-78.04667
120408|Huamali|Jauja|Junín|-11.80722|-75.42417
120905|Huamancaca Chico|Chupaca|Junín|-12.08083|-75.24222
050403|Huamanguilla|Huanta|Ayacucho|-13.01111|-74.17306
051008|Huamanquiquia|Víctor Fajardo|Ayacucho|-13.72917|-74.27222
150403|Huamantanga|Canta|Lima|-11.49917|-76.74944
090408|Huamatambo|Castrovirreyna|Huancavelica|-13.09444|-75.67722
051105|Huambalpa|Vilcas Huamán|Ayacucho|-13.75028|-73.93167
010604|Huambo|Rodríguez de Mendoza|Amazonas|-6.43111|-77.53667
040507|Huambo|Caylloma|Arequipa|-15.72944|-72.10972
060409|Huambos|Chota|Cajamarca|-6.45278|-78.96111
151013|Huampara|Yauyos|Lima|-12.36028|-76.16722
040508|Huanca|Caylloma|Arequipa|-16.03361|-71.87806
090307|Huanca-Huanca|Angaraes|Huancavelica|-12.91861|-74.61000
190303|Huancabamba|Oxapampa|Pasco|-10.42611|-75.52389
200301|Huancabamba|Huancabamba|Piura|-5.23861|-79.45028
120119|Huancan|Huancayo|Junín|-12.10667|-75.21667
210601|Huancané|Huancané|Puno|-15.20083|-69.76778
110502|Huancano|Pisco|Ica|-13.60083|-75.61861
051001|Huancapi|Víctor Fajardo|Ayacucho|-13.75222|-74.06667
150304|Huancapon|Cajatambo|Lima|-10.54944|-77.11250
030204|Huancarama|Andahuaylas|Apurímac|-13.64472|-73.08556
081105|Huancarani|Paucartambo|Cusco|-13.50333|-71.65444
030205|Huancaray|Andahuaylas|Apurímac|-13.75722|-73.52750
051009|Huancaraylla|Víctor Fajardo|Ayacucho|-13.71889|-74.10250
040407|Huancarqui|Castilla|Arequipa|-16.09611|-72.47222
010108|Huancas|Chachapoyas|Amazonas|-6.17361|-77.86444
130804|Huancaspata|Pataz|La Libertad|-8.45750|-77.29833
090101|Huancavelica|Huancavelica|Huancavelica|-12.78694|-74.97139
151014|Huancaya|Yauyos|Lima|-12.20333|-75.79917
120101|Huancayo|Huancayo|Junín|-12.07083|-75.20889
130104|Huanchaco|Trujillo|La Libertad|-8.08000|-79.12167
020104|Huanchay|Huaraz|Áncash|-9.72361|-77.81861
090119|Huando|Huancavelica|Huancavelica|-12.56417|-74.94778
021505|Huandoval|Pallasca|Áncash|-8.33111|-77.97528
151015|Huangascar|Yauyos|Lima|-12.89944|-75.83194
030105|Huanipaca|Abancay|Apurímac|-13.49222|-72.93333
081005|Huanoquite|Paruro|Cusco|-13.68194|-72.01806
050401|Huanta|Huanta|Ayacucho|-12.93944|-74.24806
151016|Huantan|Yauyos|Lima|-12.45639|-75.81167
021008|Huantar|Huari|Áncash|-9.45194|-77.17667
230205|Huanuara|Candarave|Tacna|-17.31361|-70.32250
100101|Huánuco|Huánuco|Huánuco|-9.93000|-76.23972
040309|Huanuhuanu|Caravelí|Arequipa|-15.65889|-74.09139
150708|Huanza|Huarochirí|Lima|-11.65611|-76.50361
151017|Huañec|Yauyos|Lima|-12.29389|-76.13861
030303|Huaquirca|Antabamba|Apurímac|-14.33944|-72.89500
150601|Huaral|Huaral|Lima|-11.49528|-77.20694
130605|Huaranchal|Otuzco|La Libertad|-7.68972|-78.44250
060903|Huarango|San Ignacio|Cajamarca|-5.27222|-78.77583
020101|Huaraz|Huaraz|Áncash|-9.52972|-77.52917
021001|Huari|Huari|Áncash|-9.34722|-77.17083
190103|Huariaca|Pasco|Pasco|-10.43917|-76.19167
090709|Huaribamba|Tayacaja|Huancavelica|-12.27972|-74.93833
120703|Huaricolca|Tarma|Junín|-11.51194|-75.65278
120409|Huaripampa|Jauja|Junín|-11.80778|-75.47111
200304|Huarmaca|Huancabamba|Piura|-5.56806|-79.52444
021101|Huarmey|Huarmey|Áncash|-10.06889|-78.15167
081207|Huaro|Quispicanchi|Cusco|-13.69028|-71.64028
150709|Huarochirí|Huarochirí|Lima|-12.13611|-76.23194
080305|Huarocondo|Anta|Cusco|-13.41583|-72.20750
150404|Huaros|Canta|Lima|-11.40667|-76.57583
120704|Huasahuasi|Tarma|Junín|-11.26500|-75.65028
120120|Huasicancha|Huancayo|Junín|-12.33222|-75.28194
060304|Huasmin|Celendín|Cajamarca|-6.83750|-78.24472
130504|Huaso|Julcán|La Libertad|-8.22472|-78.41417
020509|Huasta|Bolognesi|Áncash|-10.12333|-77.14667
021203|Huata|Huaylas|Áncash|-9.01639|-77.86139
210108|Huata|Puno|Puno|-15.61500|-69.97139
210603|Huatasani|Huancané|Puno|-15.05944|-69.80194
150806|Huaura|Huaura|Lima|-11.06972|-77.59917
120803|Huay-Huay|Yauli|Junín|-11.72250|-75.90500
090604|Huayacundo Arma|Huaytará|Huancavelica|-13.53417|-75.31444
021104|Huayan|Huarmey|Áncash|-9.87528|-77.70833
030206|Huayana|Andahuaylas|Apurímac|-14.05083|-73.60944
021204|Huaylas|Huaylas|Áncash|-8.87250|-77.89278
130805|Huaylillas|Pataz|La Libertad|-8.18722|-77.34389
021906|Huayllabamba|Sihuas|Áncash|-8.53472|-77.56694
081303|Huayllabamba|Urubamba|Cusco|-13.33806|-72.06500
020510|Huayllacayan|Bolognesi|Áncash|-10.24500|-77.43472
090107|Huayllahuara|Huancavelica|Huancavelica|-12.40917|-75.17833
021602|Huayllan|Pomabamba|Áncash|-8.85806|-77.43556
021704|Huayllapampa|Recuay|Áncash|-10.05556|-77.53667
030704|Huayllati|Grau|Apurímac|-13.92806|-72.48444
190104|Huayllay|Pasco|Pasco|-11.00194|-76.36472
090308|Huayllay Grande|Angaraes|Huancavelica|-12.94278|-74.70167
040804|Huaynacotas|La Uniòn|Arequipa|-15.17472|-72.84972
130806|Huayo|Pataz|La Libertad|-8.00444|-77.59222
080903|Huayopata|La Convención|Cusco|-13.00472|-72.55444
210903|Huayrapata|Moho|Puno|-15.32139|-69.34111
090601|Huaytará|Huaytará|Huancavelica|-13.60472|-75.35306
120121|Huayucachi|Huancayo|Junín|-12.13861|-75.22361
170204|Huepetuhe|Manu|Madre de Dios|-12.99361|-70.52722
120410|Huertas|Jauja|Junín|-11.76000|-75.46972
220603|Huicungo|Mariscal Cáceres|San Martín|-7.31694|-76.77722
220907|Huimbayoc|San Martín|San Martín|-6.41778|-75.76806
110503|Humay|Pisco|Ica|-13.72278|-75.88667
170302|Iberia|Tahuamanu|Madre de Dios|-11.41083|-69.48694
110101|Ica|Ica|Ica|-14.06361|-75.72917
061005|Ichocan|San Marcos|Cajamarca|-7.36889|-78.12972
180204|Ichuña|General Sánchez Cerro|Moquegua|-16.14056|-70.53556
040509|Ichupampa|Caylloma|Arequipa|-15.65000|-71.68667
200603|Ignacio Escudero|Sullana|Piura|-4.84611|-80.87306
050404|Iguain|Huanta|Ayacucho|-12.99250|-74.20889
150606|Ihuari|Huaral|Lima|-11.18861|-76.95194
030407|Ihuayllo|Aymaraes|Apurímac|-14.13306|-73.26778
230302|Ilabaya|Jorge Basadre|Tacna|-17.41806|-70.51306
210501|Ilave|El Collao|Puno|-16.08694|-69.63806
140303|Illimo|Lambayeque|Lambayeque|-6.47389|-79.85472
180301|Ilo|Ilo|Moquegua|-17.62500|-71.34333
010205|Imaza|Bagua|Amazonas|-5.16361|-78.28889
150507|Imperial|Cañete|Lima|-13.06056|-76.35278
160602|Inahuaya|Ucayali|Loreto|-7.11694|-75.26250
170102|Inambari|Tambopata|Madre de Dios|-13.10139|-70.37167
140203|Incahuasi|Ferreñafe|Lambayeque|-6.23528|-79.31694
210604|Inchupalla|Huancané|Puno|-15.00972|-69.68278
230105|Inclan|Tacna|Tacna|-17.79389|-70.49472
020105|Independencia|Huaraz|Áncash|-9.51444|-77.53250
051106|Independencia|Vilcas Huamán|Ayacucho|-13.85278|-73.87722
110504|Independencia|Pisco|Ica|-13.69389|-76.02472
150112|Independencia|Lima|Lima|-11.99722|-77.05472
160104|Indiana|Maynas|Loreto|-3.50028|-73.04111
120122|Ingenio|Huancayo|Junín|-11.89056|-75.26639
010506|Inguilpata|Luya|Amazonas|-6.23944|-77.95389
080911|Inkawasi|La Convención|Cusco|-13.29000|-73.26556
170301|Iñapari|Tahuamanu|Madre de Dios|-10.94500|-69.57667
250103|Iparia|Coronel Portillo|Ucayali|-9.30611|-74.43556
160101|Iquitos|Maynas|Loreto|-3.74806|-73.24417
040605|Iray|Condesuyos|Arequipa|-15.85361|-72.63000
250302|Irazola|Padre Abad|Ucayali|-8.82861|-75.21333
040704|Islay|Islay|Arequipa|-17.00083|-72.09750
230303|Ite|Jorge Basadre|Tacna|-17.86167|-70.96583
210307|Ituata|Carabaya|Puno|-13.87639|-70.21389
090108|Izcuchaca|Huancavelica|Huancavelica|-12.50000|-74.99778
101105|Jacas Chico|Yarowilca|Huánuco|-9.88639|-76.50306
100504|Jacas Grande|Huamalíes|Huánuco|-9.54000|-76.73667
040107|Jacobo Hunter|Arequipa|Arequipa|-16.44139|-71.55861
060801|Jaén|Jaén|Cajamarca|-5.70889|-78.80917
010705|Jamalca|Utcubamba|Amazonas|-5.89417|-78.23778
020106|Jangas|Huaraz|Áncash|-9.40056|-77.57750
120411|Janjaillo|Jauja|Junín|-11.76444|-75.61028
040310|Jaqui|Caravelí|Arequipa|-15.47917|-74.44361
120401|Jauja|Jauja|Junín|-11.77556|-75.50056
140304|Jayanca|Lambayeque|Lambayeque|-6.39278|-79.82278
010307|Jazan|Bongará|Amazonas|-5.94139|-77.97722
160205|Jeberos|Alto Amazonas|Loreto|-5.29083|-76.28333
160510|Jenaro Herrera|Requena|Loreto|-4.90361|-73.67056
220104|Jepelacio|Moyobamba|San Martín|-6.10806|-76.91528
130703|Jequetepeque|Pacasmayo|La Libertad|-7.33750|-79.56306
060106|Jesús|Cajamarca|Cajamarca|-7.24861|-78.37917
101001|Jesús|Lauricocha|Huánuco|-10.07833|-76.63139
150113|Jesús María|Lima|Lima|-12.07556|-77.04333
050115|Jesús Nazareno|Huamanga|Ayacucho|-13.15417|-74.21250
200203|Jilili|Ayabaca|Piura|-4.58472|-79.79722
100505|Jircan|Huamalíes|Huánuco|-9.24694|-76.71917
101003|Jivia|Lauricocha|Huánuco|-10.02333|-76.68028
060305|Jorge Chávez|Celendín|Cajamarca|-6.94111|-78.09167
100604|José Crespo y Castillo|Leoncio Prado|Huánuco|-8.93222|-76.11611
210207|José Domingo Choquehuanca|Azángaro|Puno|-15.03389|-70.33806
060306|José Gálvez|Celendín|Cajamarca|-6.92556|-78.13278
140105|José Leonardo Ortiz|Chiclayo|Lambayeque|-6.76306|-79.83444
040129|José Luis Bustamante Y Rivero|Arequipa|Arequipa|-16.42667|-71.52389
061006|José Manuel Quiroz|San Marcos|Cajamarca|-7.34944|-78.04778
030220|José María Arguedas|Andahuaylas|Apurímac|-13.73417|-73.35056
040202|José María Quimper|Camaná|Arequipa|-16.60194|-72.72722
061007|José Sabogal|San Marcos|Cajamarca|-7.25111|-78.03667
030304|Juan Espinoza Medrano|Antabamba|Apurímac|-14.42833|-72.91500
220908|Juan Guerra|San Martín|San Martín|-6.58417|-76.33083
220601|Juanjuí|Mariscal Cáceres|San Martín|-7.17667|-76.72389
090309|Julcamarca|Angaraes|Huancavelica|-13.01472|-74.44444
120412|Julcán|Jauja|Junín|-11.75917|-75.43528
130501|Julcán|Julcán|La Libertad|-8.04278|-78.48639
210401|Juli|Chucuito|Puno|-16.21278|-69.45944
211101|Juliaca|San Román|Puno|-15.48389|-70.13333
010301|Jumbilla|Bongará|Amazonas|-5.90444|-77.79778
120501|Junín|Junín|Junín|-11.16139|-75.99833
030408|Justo Apu Sahuaraura|Aymaraes|Apurímac|-14.14806|-73.17389
030219|Kaquiabamba|Andahuaylas|Apurímac|-13.53250|-73.28833
210404|Kelluyo|Chucuito|Puno|-16.72694|-69.25028
080907|Kimbiri|La Convención|Cusco|-12.62000|-73.78917
030207|Kishuara|Andahuaylas|Apurímac|-13.69111|-73.11861
081106|Kosñipata|Paucartambo|Cusco|-12.90944|-71.40333
080503|Kunturkanki|Canas|Cusco|-14.53472|-71.30694
200109|La Arena|Piura|Piura|-5.34306|-80.70361
220909|La Banda de Shilcayo|San Martín|San Martín|-6.49000|-76.34056
200703|La Brea|Talara|Piura|-4.65472|-81.30583
180205|La Capilla|General Sánchez Cerro|Moquegua|-16.75667|-71.17917
060904|La Coipa|San Ignacio|Cajamarca|-5.39278|-78.90639
240103|La Cruz|Tumbes|Tumbes|-3.63722|-80.59000
130606|La Cuesta|Otuzco|La Libertad|-7.91889|-78.70472
061305|La Esperanza|Santa Cruz|Cajamarca|-6.59250|-78.89583
130105|La Esperanza|Trujillo|La Libertad|-8.05611|-79.05167
061106|La Florida|San Miguel|Cajamarca|-6.86861|-79.12583
200505|La Huaca|Paita|Piura|-4.91028|-80.96139
010109|La Jalca|Chachapoyas|Amazonas|-6.48472|-77.81500
040108|La Joya|Arequipa|Arequipa|-16.42306|-71.81833
020107|La Libertad|Huaraz|Áncash|-9.63306|-77.74139
060312|La Libertad de Pallan|Celendín|Cajamarca|-6.72389|-78.28250
200404|La Matanza|Morropón|Piura|-5.21361|-80.09056
020204|La Merced|Aija|Áncash|-9.73556|-77.61611
090505|La Merced|Churcampa|Huancavelica|-12.78806|-74.35861
150114|La Molina|Lima|Lima|-12.07806|-76.91667
100704|La Morada|Marañón|Huánuco|-8.79444|-76.24972
120801|La Oroya|Yauli|Junín|-11.52194|-75.90778
020905|La Pampa|Corongo|Áncash|-8.66111|-77.90083
010206|La Peca|Bagua|Amazonas|-5.61194|-78.43694
070104|La Perla|Prov. Const. del Callao|Callao|-12.06583|-77.10806
020511|La Primavera|Bolognesi|Áncash|-10.33556|-77.12528
070105|La Punta|Prov. Const. del Callao|Callao|-12.07278|-77.16333
060605|La Ramada|Cutervo|Cajamarca|-6.25333|-78.57556
110102|La Tinguiña|Ica|Ica|-14.03333|-75.71056
100301|La Unión|Dos de Mayo|Huánuco|-9.83778|-76.80361
120705|La Unión|Tarma|Junín|-11.37722|-75.75194
200110|La Unión|Piura|Piura|-5.38833|-80.73722
140106|La Victoria|Chiclayo|Lambayeque|-6.79444|-79.84444
150115|La Victoria|Lima|Lima|-12.06500|-77.03083
230111|La Yarada los Palos|Tacna|Tacna|-18.28611|-70.43917
170104|Laberinto|Tambopata|Madre de Dios|-12.71722|-69.58667
021506|Lacabamba|Pallasca|Áncash|-8.26028|-77.89833
150405|Lachaqui|Canta|Lima|-11.55306|-76.62556
140107|Lagunas|Chiclayo|Lambayeque|-6.99111|-79.62278
160206|Lagunas|Alto Amazonas|Loreto|-5.22389|-75.67500
200204|Lagunas|Ayabaca|Piura|-4.78917|-79.84500
150710|Lahuaytambo|Huarochirí|Lima|-12.09639|-76.38889
060410|Lajas|Chota|Cajamarca|-6.56056|-78.73472
200305|Lalaquiz|Huancabamba|Piura|-5.21583|-79.68000
220501|Lamas|Lamas|San Martín|-6.42389|-76.52333
080403|Lamay|Calca|Cusco|-13.36444|-71.92083
140301|Lambayeque|Lambayeque|Lambayeque|-6.70694|-79.89528
030106|Lambrama|Abancay|Apurímac|-13.87083|-72.76972
050804|Lampa|Pàucar del Sara Sara|Ayacucho|-15.18500|-73.34917
210701|Lampa|Lampa|Puno|-15.36472|-70.36778
150607|Lampian|Huaral|Lima|-11.23778|-76.83917
010501|Lamud|Luya|Amazonas|-6.13917|-77.95222
200604|Lancones|Sullana|Piura|-4.63278|-80.54556
150711|Langa|Huarochirí|Lima|-12.12556|-76.42111
080504|Langui|Canas|Cusco|-14.43222|-71.27278
090605|Laramarca|Huaytará|Huancavelica|-13.94861|-75.03556
050608|Laramate|Lucanas|Ayacucho|-14.28611|-74.84250
150712|Laraos|Huarochirí|Lima|-11.66444|-76.53944
151018|Laraos|Yauyos|Lima|-12.34667|-75.78583
130106|Laredo|Trujillo|La Libertad|-8.08972|-78.96028
080404|Lares|Calca|Cusco|-13.10417|-72.04472
040510|Lari|Caylloma|Arequipa|-15.61833|-71.77250
090109|Laria|Huancavelica|Huancavelica|-12.56111|-75.03694
160105|Las Amazonas|Maynas|Loreto|-3.42306|-72.76444
200111|Las Lomas|Piura|Piura|-4.65000|-80.23917
170103|Las Piedras|Tambopata|Madre de Dios|-12.27917|-69.15028
060806|Las Pirias|Jaén|Cajamarca|-5.62722|-78.85278
080505|Layo|Canas|Cusco|-14.49417|-71.15556
010110|Leimebamba|Chachapoyas|Amazonas|-6.70750|-77.80389
050609|Leoncio Prado|Lucanas|Ayacucho|-14.72889|-74.67028
150807|Leoncio Prado|Huaura|Lima|-11.06111|-76.93028
120413|Leonor Ordóñez|Jauja|Junín|-11.85944|-75.41750
010111|Levanto|Chachapoyas|Amazonas|-6.30778|-77.89917
150101|Lima|Lima|Lima|-12.04528|-77.03083
010605|Limabamba|Rodríguez de Mendoza|Amazonas|-6.49806|-77.49889
080306|Limatambo|Anta|Cusco|-13.47972|-72.44278
211203|Limbani|Sandia|Puno|-14.14972|-69.69056
150116|Lince|Lima|Lima|-12.08444|-77.03028
151019|Lincha|Yauyos|Lima|-12.79972|-75.66667
090301|Lircay|Angaraes|Huancavelica|-12.98278|-74.71833
080705|Livitaca|Chumbivilcas|Cusco|-14.31278|-71.68972
060107|Llacanora|Cajamarca|Cajamarca|-7.19361|-78.42667
021705|Llacllin|Recuay|Áncash|-10.06917|-77.62167
210804|Llalli|Melgar|Puno|-14.94806|-70.88056
021305|Llama|Mariscal Luzuriaga|Áncash|-8.91500|-77.30139
060411|Llama|Chota|Cajamarca|-6.51444|-79.12028
020301|Llamellin|Antonio Raymondi|Áncash|-9.10083|-77.01694
061107|Llapa|San Miguel|Cajamarca|-6.98083|-78.80750
021507|Llapo|Pallasca|Áncash|-8.51444|-78.04222
100501|Llata|Huamalíes|Huánuco|-9.54972|-76.81861
050610|Llauta|Lucanas|Ayacucho|-14.24361|-74.92028
120603|Llaylla|Satipo|Junín|-11.38111|-74.59028
021407|Llipa|Ocros|Áncash|-10.39250|-77.19083
110402|Llipata|Palpa|Ica|-14.56333|-75.20750
050408|Llochegua|Huanta|Ayacucho|-12.41000|-73.90639
120414|Llocllapampa|Jauja|Junín|-11.81750|-75.62389
180206|Lloque|General Sánchez Cerro|Moquegua|-16.32389|-70.73861
021306|Llumpa|Mariscal Luzuriaga|Áncash|-8.96083|-77.36750
080706|Llusco|Chumbivilcas|Cusco|-14.33750|-72.11361
040511|Lluta|Caylloma|Arequipa|-16.01556|-72.01389
200704|Lobitos|Talara|Piura|-4.45694|-81.28500
090506|Locroja|Churcampa|Huancavelica|-12.74028|-74.44194
230301|Locumba|Jorge Basadre|Tacna|-17.61389|-70.76278
040311|Lomas|Caravelí|Arequipa|-15.56972|-74.85139
010606|Longar|Rodríguez de Mendoza|Amazonas|-6.38583|-77.54667
130304|Longotea|Bolívar|La Libertad|-7.04389|-77.87222
010507|Longuita|Luya|Amazonas|-6.41361|-77.96833
010508|Lonya Chico|Luya|Amazonas|-6.22972|-77.95500
010706|Lonya Grande|Utcubamba|Amazonas|-6.09639|-78.42250
110103|Los Aquijes|Ica|Ica|-14.09639|-75.69056
060108|Los Baños del Inca|Cajamarca|Cajamarca|-7.16361|-78.46444
030611|Los Chankas|Chincheros|Apurímac|-13.43500|-73.82194
050203|Los Morochucos|Cangallo|Ayacucho|-13.55750|-74.19500
150117|Los Olivos|Lima|Lima|-11.99139|-77.07083
200705|Los Organos|Talara|Piura|-4.17917|-81.12944
050611|Lucanas|Lucanas|Ayacucho|-14.62250|-74.23306
021307|Lucma|Mariscal Luzuriaga|Áncash|-8.91944|-77.41083
131102|Lucma|Gran Chimú|La Libertad|-7.64056|-78.55222
030409|Lucre|Aymaraes|Apurímac|-13.94972|-73.22611
081208|Lucre|Quispicanchi|Cusco|-13.63389|-71.73667
050506|Luis Carranza|La Mar|Ayacucho|-13.22889|-73.89444
150508|Lunahuana|Cañete|Lima|-12.97056|-76.15111
050405|Luricocha|Huanta|Ayacucho|-12.89972|-74.27361
150118|Lurigancho|Lima|Lima|-11.93583|-76.69722
150119|Lurin|Lima|Lima|-12.27472|-76.87028
010509|Luya|Luya|Amazonas|-6.16417|-77.94417
010510|Luya Viejo|Luya|Amazonas|-6.12750|-78.08500
100605|Luyando|Leoncio Prado|Huánuco|-9.24806|-75.99417
040512|Maca|Caylloma|Arequipa|-15.64139|-71.76833
210805|Macari|Melgar|Puno|-14.77167|-70.90333
021804|Macate|Santa|Áncash|-8.76028|-78.06139
040408|Machaguay|Castilla|Arequipa|-15.65028|-72.50611
130608|Mache|Otuzco|La Libertad|-8.02917|-78.53500
081304|Machupicchu|Urubamba|Cusco|-13.15417|-72.52556
210301|Macusani|Carabaya|Puno|-14.06861|-70.43111
151020|Madean|Yauyos|Lima|-12.94444|-75.77722
170203|Madre de Dios|Manu|Madre de Dios|-12.61861|-70.39417
040513|Madrigal|Caylloma|Arequipa|-15.60833|-71.80750
010112|Magdalena|Chachapoyas|Amazonas|-6.37306|-77.90167
060109|Magdalena|Cajamarca|Cajamarca|-7.25083|-78.65972
130204|Magdalena de Cao|Ascope|La Libertad|-7.87639|-79.29583
150120|Magdalena del Mar|Lima|Lima|-12.09167|-77.06722
040520|Majes|Caylloma|Arequipa|-16.35333|-72.24722
150509|Mala|Cañete|Lima|-12.65750|-76.63250
021105|Malvas|Huarmey|Áncash|-9.92972|-77.65778
030705|Mamara|Grau|Apurímac|-14.22861|-72.59083
250107|Manantay|Coronel Portillo|Ucayali|-8.40028|-74.54139
150305|Manas|Cajatambo|Lima|-10.59556|-77.16722
200706|Mancora|Talara|Piura|-4.10694|-81.05389
022003|Mancos|Yungay|Áncash|-9.19000|-77.71222
020512|Mangas|Bolognesi|Áncash|-10.36944|-77.10333
160703|Manseriche|Datem del Marañón|Loreto|-4.56361|-77.41722
090110|Manta|Huancavelica|Huancavelica|-12.62056|-75.21111
170201|Manu|Manu|Madre de Dios|-12.83722|-71.36528
140204|Manuel Antonio Mesones Muro|Ferreñafe|Lambayeque|-6.64500|-79.73889
120208|Manzanares|Concepción|Junín|-12.01611|-75.34583
210109|Mañazo|Puno|Puno|-15.80111|-70.34333
160505|Maquia|Requena|Loreto|-5.74972|-74.53778
030505|Mara|Cotabambas|Apurímac|-14.08667|-72.10194
080604|Marangani|Canchis|Cusco|-14.35667|-71.16861
080904|Maranura|La Convención|Cusco|-12.96278|-72.66472
081305|Maras|Urubamba|Cusco|-13.33250|-72.15639
021706|Marca|Recuay|Áncash|-10.08917|-77.47444
130905|Marcabal|Sánchez Carrión|La Libertad|-7.70583|-78.03361
050805|Marcabamba|Pàucar del Sara Sara|Ayacucho|-15.14972|-73.34167
081209|Marcapata|Quispicanchi|Cusco|-13.59167|-70.97500
120804|Marcapomacocha|Yauli|Junín|-11.40667|-76.33611
020606|Marcara|Carhuaz|Áncash|-9.32278|-77.60361
090205|Marcas|Acobamba|Huancavelica|-12.89028|-74.39806
200605|Marcavelica|Sullana|Piura|-4.88167|-80.70361
120415|Marco|Jauja|Junín|-11.74056|-75.56111
110304|Marcona|Nasca|Ica|-15.36194|-75.16583
100105|Margos|Huánuco|Huánuco|-10.00528|-76.52333
010511|María|Luya|Amazonas|-6.42889|-77.96083
050204|María Parado de Bellido|Cangallo|Ayacucho|-13.60472|-74.23639
100606|Mariano Damaso Beraun|Leoncio Prado|Huánuco|-9.44278|-75.97111
040109|Mariano Melgar|Arequipa|Arequipa|-16.40722|-71.50556
040203|Mariano Nicolás Valcárcel|Camaná|Arequipa|-16.03139|-73.17444
100311|Marías|Dos de Mayo|Huánuco|-9.60750|-76.70667
150713|Mariatana|Huarochirí|Lima|-12.23722|-76.32611
010607|Mariscal Benavides|Rodríguez de Mendoza|Amazonas|-6.38611|-77.50444
040204|Mariscal Cáceres|Camaná|Arequipa|-16.61972|-72.73611
090111|Mariscal Cáceres|Huancavelica|Huancavelica|-12.53444|-74.93250
010113|Mariscal Castilla|Chachapoyas|Amazonas|-6.59444|-77.80861
120209|Mariscal Castilla|Concepción|Junín|-11.61917|-75.09000
131103|Marmot|Gran Chimú|La Libertad|-7.69833|-78.62611
021009|Masin|Huari|Áncash|-9.36583|-77.09639
250104|Masisea|Coronel Portillo|Ucayali|-8.60472|-74.30611
120416|Masma|Jauja|Junín|-11.78528|-75.42611
120417|Masma Chicche|Jauja|Junín|-11.78611|-75.38167
022004|Matacoto|Yungay|Áncash|-9.17694|-77.74722
120210|Matahuasi|Concepción|Junín|-11.89389|-75.34417
180207|Matalaque|General Sánchez Cerro|Moquegua|-16.48111|-70.82667
240303|Matapalo|Zarumilla|Tumbes|-3.68222|-80.19972
060110|Matara|Cajamarca|Cajamarca|-7.25472|-78.25972
021205|Mato|Huaylas|Áncash|-8.96139|-77.84250
150701|Matucana|Huarochirí|Lima|-11.84500|-76.38611
120604|Mazamari|Satipo|Junín|-11.32500|-74.53028
160106|Mazan|Maynas|Loreto|-3.48861|-73.08167
080914|Megantoni|La Convención|Cusco|-11.72028|-72.94639
040705|Mejia|Islay|Arequipa|-17.10111|-71.90750
070107|Mi Perú|Prov. Const. del Callao|Callao|-11.85500|-77.12500
030706|Micaela Bastidas|Grau|Apurímac|-14.11528|-72.61417
200606|Miguel Checa|Sullana|Piura|-4.90028|-80.81472
060307|Miguel Iglesias|Celendín|Cajamarca|-6.65028|-78.23250
010608|Milpuc|Rodríguez de Mendoza|Amazonas|-6.50000|-77.43639
060412|Miracosta|Chota|Cajamarca|-6.40444|-79.28361
040110|Miraflores|Arequipa|Arequipa|-16.39472|-71.52250
100506|Miraflores|Huamalíes|Huánuco|-9.49389|-76.81861
150122|Miraflores|Lima|Lima|-12.12167|-77.02917
151021|Miraflores|Yauyos|Lima|-12.27444|-75.85028
020305|Mirgas|Antonio Raymondi|Áncash|-9.07861|-77.09250
120211|Mito|Concepción|Junín|-11.93722|-75.33917
130107|Moche|Trujillo|La Libertad|-8.17139|-79.00917
140305|Mochumi|Lambayeque|Lambayeque|-6.54778|-79.86500
210901|Moho|Moho|Puno|-15.36028|-69.49972
100803|Molino|Pachitea|Huánuco|-9.91083|-76.01667
010114|Molinopampa|Chachapoyas|Amazonas|-6.20917|-77.66917
120418|Molinos|Jauja|Junín|-11.73778|-75.44611
131004|Mollebamba|Santiago de Chuco|La Libertad|-8.17083|-77.97389
040111|Mollebaya|Arequipa|Arequipa|-16.48722|-71.46694
040701|Mollendo|Islay|Arequipa|-17.02917|-72.01639
090409|Mollepampa|Castrovirreyna|Huancavelica|-13.31139|-75.41000
080307|Mollepata|Anta|Cusco|-13.50917|-72.52778
131005|Mollepata|Santiago de Chuco|La Libertad|-8.19333|-77.95722
120419|Monobamba|Jauja|Junín|-11.36056|-75.32667
140108|Monsefu|Chiclayo|Lambayeque|-6.87806|-79.87250
200205|Montero|Ayabaca|Piura|-4.63222|-79.82889
010115|Montevideo|Chachapoyas|Amazonas|-6.61806|-77.80222
100507|Monzón|Huamalíes|Huánuco|-9.28000|-76.39667
180101|Moquegua|Mariscal Nieto|Moquegua|-17.19417|-70.93333
220910|Morales|San Martín|San Martín|-6.47917|-76.38306
050906|Morcolla|Sucre|Ayacucho|-14.10861|-73.87194
021805|Moro|Santa|Áncash|-9.13889|-78.18333
120805|Morococha|Yauli|Junín|-11.58722|-76.06333
160704|Morona|Datem del Marañón|Loreto|-4.32639|-77.21611
140306|Morrope|Lambayeque|Lambayeque|-6.54028|-80.01556
200405|Morropón|Morropón|Piura|-5.18611|-79.96917
080204|Mosoc Llacta|Acomayo|Cusco|-14.12028|-71.47306
140307|Motupe|Lambayeque|Lambayeque|-6.15083|-79.71417
090112|Moya|Huancavelica|Huancavelica|-12.42333|-75.15389
220101|Moyobamba|Moyobamba|San Martín|-6.03472|-76.97417
210208|Muñani|Azángaro|Puno|-14.77083|-69.95556
120420|Muqui|Jauja|Junín|-11.83333|-75.43500
120421|Muquiyauyo|Jauja|Junín|-11.81389|-75.45389
021308|Musga|Mariscal Luzuriaga|Áncash|-8.90611|-77.33917
060905|Namballe|San Ignacio|Cajamarca|-5.00417|-79.08722
060111|Namora|Cajamarca|Cajamarca|-7.20278|-78.32472
061108|Nanchoc|San Miguel|Cajamarca|-6.95944|-79.24250
160107|Napo|Maynas|Loreto|-2.48917|-73.67611
110301|Nasca|Nasca|Ica|-14.82694|-74.93722
160301|Nauta|Loreto|Loreto|-4.50139|-73.56944
150905|Navan|Oyón|Lima|-10.83778|-77.01444
021806|Nepeña|Santa|Áncash|-9.17278|-78.36083
250304|Neshuya|Padre Abad|Ucayali|-8.64000|-74.96444
210704|Nicasio|Lampa|Puno|-15.23556|-70.26111
040205|Nicolás de Pierola|Camaná|Arequipa|-16.57306|-72.71583
061109|Niepos|San Miguel|Cajamarca|-6.92667|-79.13000
010401|Nieva|Condorcanqui|Amazonas|-4.59222|-77.86444
061306|Ninabamba|Santa Cruz|Cajamarca|-6.64972|-78.78750
190105|Ninacaca|Pasco|Pasco|-10.85556|-76.11306
140109|Nueva Arica|Chiclayo|Lambayeque|-6.87417|-79.34361
220804|Nueva Cajamarca|Rioja|San Martín|-5.93611|-77.30694
250106|Nueva Requena|Coronel Portillo|Ucayali|-8.32056|-74.85139
120212|Nueve de Julio|Concepción|Junín|-11.89778|-75.31806
021809|Nuevo Chimbote|Santa|Áncash|-9.12861|-78.53083
150510|Nuevo Imperial|Cañete|Lima|-13.07556|-76.31667
090113|Nuevo Occoro|Huancavelica|Huancavelica|-12.59500|-75.01972
221002|Nuevo Progreso|Tocache|San Martín|-8.45056|-76.32639
210806|Nuñoa|Melgar|Puno|-14.47611|-70.63639
090710|Ñahuimpuquio|Tayacaja|Huancavelica|-12.32917|-75.06944
101106|Obas|Yarowilca|Huánuco|-9.79528|-76.66583
010512|Ocalli|Luya|Amazonas|-6.23528|-78.26639
050612|Ocaña|Lucanas|Ayacucho|-14.39889|-74.82278
030605|Ocobamba|Chincheros|Apurímac|-13.48250|-73.56028
080905|Ocobamba|La Convención|Cusco|-12.87167|-72.44722
081210|Ocongate|Quispicanchi|Cusco|-13.62667|-71.38833
040206|Ocoña|Camaná|Arequipa|-16.43167|-73.10500
080804|Ocoruro|Espinar|Cusco|-15.05194|-71.12917
090606|Ocoyo|Huaytará|Huancavelica|-14.00806|-75.02250
021401|Ocros|Ocros|Áncash|-10.40333|-77.39667
050106|Ocros|Huamanga|Ayacucho|-13.39056|-73.91556
110104|Ocucaje|Ica|Ica|-14.34667|-75.67222
010513|Ocumal|Luya|Amazonas|-6.28250|-78.21083
210705|Ocuviri|Lampa|Puno|-15.11389|-70.90917
210308|Ollachea|Carabaya|Puno|-13.79389|-70.47250
081306|Ollantaytambo|Urubamba|Cusco|-13.25889|-72.26333
211305|Ollaraya|Yunguyo|Puno|-16.21972|-68.99111
010116|Olleros|Chachapoyas|Amazonas|-6.02389|-77.67639
020108|Olleros|Huaraz|Áncash|-9.66667|-77.46556
140308|Olmos|Lambayeque|Lambayeque|-5.98778|-79.74750
081006|Omachaç|Paruro|Cusco|-14.06944|-71.73806
151022|Omas|Yauyos|Lima|-12.51472|-76.28944
180201|Omate|General Sánchez Cerro|Moquegua|-16.67361|-70.97056
010609|Omia|Rodríguez de Mendoza|Amazonas|-6.46778|-77.39556
120503|Ondores|Junín|Junín|-11.08361|-76.14667
130807|Ongon|Pataz|La Libertad|-8.20778|-76.98278
030606|Ongoy|Chincheros|Apurímac|-13.40278|-73.66833
040409|Orcopampa|Castilla|Arequipa|-15.26250|-72.34194
120213|Orcotuna|Concepción|Junín|-11.96722|-75.30750
050511|Oronccoy|La Mar|Ayacucho|-13.38083|-73.43611
030305|Oropesa|Antabamba|Apurímac|-14.26056|-72.56361
081211|Oropesa|Quispicanchi|Cusco|-13.59444|-71.76306
210807|Orurillo|Melgar|Puno|-14.72778|-70.51222
050613|Otoca|Lucanas|Ayacucho|-14.49000|-74.68667
130601|Otuzco|Otuzco|La Libertad|-7.90222|-78.56556
060308|Oxamarca|Celendín|Cajamarca|-7.04222|-78.06833
190301|Oxapampa|Oxapampa|Pasco|-10.57500|-75.40472
050806|Oyolo|Pàucar del Sara Sara|Ayacucho|-15.18000|-73.18528
150901|Oyón|Oyón|Lima|-10.66806|-76.77333
140110|Oyotun|Chiclayo|Lambayeque|-6.85444|-79.30639
120422|Paca|Jauja|Junín|-11.70917|-75.51833
200206|Pacaipampa|Ayabaca|Piura|-4.99556|-79.66778
130402|Pacanga|Chepén|La Libertad|-7.17139|-79.48556
050704|Pacapausa|Parinacochas|Ayacucho|-14.95028|-73.36778
150511|Pacaran|Cañete|Lima|-12.86611|-76.05417
150608|Pacaraos|Huaral|Lima|-11.18611|-76.64778
130704|Pacasmayo|Pacasmayo|La Libertad|-7.40111|-79.57222
050107|Pacaycasa|Huamanga|Ayacucho|-13.05750|-74.21583
081007|Paccaritambo|Paruro|Cusco|-13.75639|-71.95667
060413|Paccha|Chota|Cajamarca|-6.49750|-78.42361
120423|Paccha|Jauja|Junín|-11.85361|-75.50639
120806|Paccha|Yauli|Junín|-11.47306|-75.96056
150808|Paccho|Huaura|Lima|-10.95750|-76.93333
150123|Pachacamac|Lima|Lima|-12.18722|-76.86667
030306|Pachaconas|Antabamba|Apurímac|-14.22333|-73.01639
110105|Pachacutec|Ica|Ica|-14.15194|-75.69194
090510|Pachamarca|Churcampa|Huancavelica|-12.51556|-74.52667
150906|Pachangara|Oyón|Lima|-10.81111|-76.87500
100313|Pachas|Dos de Mayo|Huánuco|-9.70667|-76.77111
230106|Pachia|Tacna|Tacna|-17.89639|-70.15389
220604|Pachiza|Mariscal Cáceres|San Martín|-7.29806|-76.77333
020513|Pacllon|Bolognesi|Áncash|-10.23444|-77.07167
030208|Pacobamba|Andahuaylas|Apurímac|-13.61528|-73.08389
180303|Pacocha|Ilo|Moquegua|-17.61083|-71.34028
140309|Pacora|Lambayeque|Lambayeque|-6.42861|-79.83889
030209|Pacucha|Andahuaylas|Apurímac|-13.60944|-73.34417
250301|Padre Abad|Padre Abad|Ucayali|-9.03361|-75.50750
160603|Padre Márquez|Ucayali|Loreto|-7.94667|-74.84083
050907|Paico|Sucre|Ayacucho|-14.03833|-73.64222
130205|Paijan|Ascope|La Libertad|-7.73472|-79.30333
200207|Paimas|Ayabaca|Piura|-4.62750|-79.94556
200501|Paita|Paita|Piura|-5.09306|-81.09944
220605|Pajarillo|Mariscal Cáceres|San Martín|-7.17667|-76.68861
090114|Palca|Huancavelica|Huancavelica|-12.65694|-74.98028
120706|Palca|Tarma|Junín|-11.34611|-75.56861
210706|Palca|Lampa|Puno|-15.23694|-70.59806
230107|Palca|Tacna|Tacna|-17.77833|-69.95972
120707|Palcamayo|Tarma|Junín|-11.29583|-75.77278
190304|Palcazu|Oxapampa|Pasco|-10.18417|-75.14806
190106|Pallanchacra|Pasco|Pasco|-10.41528|-76.23556
021508|Pallasca|Pallasca|Áncash|-8.25306|-77.99944
080805|Pallpata|Espinar|Cusco|-14.89028|-71.21000
110401|Palpa|Palpa|Ica|-14.53389|-75.18500
120605|Pampa Hermosa|Satipo|Junín|-11.40417|-74.75167
160604|Pampa Hermosa|Ucayali|Loreto|-7.19639|-75.29444
030210|Pampachiri|Andahuaylas|Apurímac|-14.18694|-73.54472
040410|Pampacolca|Castilla|Arequipa|-15.71333|-72.57389
040805|Pampamarca|La Uniòn|Arequipa|-15.18250|-72.90528
080506|Pampamarca|Canas|Cusco|-14.14750|-71.46028
101107|Pampamarca|Yarowilca|Huánuco|-9.70528|-76.70250
021206|Pamparomas|Huaylas|Áncash|-9.07333|-77.98167
021509|Pampas|Pallasca|Áncash|-8.19528|-77.89583
090701|Pampas|Tayacaja|Huancavelica|-12.39917|-74.86833
021707|Pampas Chico|Recuay|Áncash|-10.11472|-77.39806
240104|Pampas de Hospital|Tumbes|Tumbes|-3.69333|-80.43917
020109|Pampas Grande|Huaraz|Áncash|-9.65528|-77.82611
100801|Panao|Pachitea|Huánuco|-9.89750|-75.99417
120424|Pancan|Jauja|Junín|-11.74889|-75.48611
120606|Pangoa|Satipo|Junín|-11.42833|-74.48889
220911|Papaplaya|San Martín|San Martín|-6.24528|-75.79056
240304|Papayal|Zarumilla|Tumbes|-3.57139|-80.23500
110505|Paracas|Pisco|Ica|-13.83889|-76.25194
150202|Paramonga|Barranca|Lima|-10.67472|-77.81806
130610|Paranday|Otuzco|La Libertad|-7.88500|-78.70944
050807|Pararca|Pàucar del Sara Sara|Ayacucho|-15.21750|-73.46472
021708|Pararin|Recuay|Áncash|-10.05000|-77.65444
050205|Paras|Cangallo|Ayacucho|-13.55250|-74.62778
210707|Paratia|Lampa|Puno|-15.45417|-70.59972
120425|Parco|Jauja|Junín|-11.80111|-75.54278
110106|Parcona|Ica|Ica|-14.05389|-75.68556
130808|Parcoy|Pataz|La Libertad|-8.03333|-77.47972
220805|Pardo Miguel|Rioja|San Martín|-5.73944|-77.50444
020110|Pariacoto|Huaraz|Áncash|-9.55944|-77.89056
020607|Pariahuanca|Carhuaz|Áncash|-9.36528|-77.58083
120124|Pariahuanca|Huancayo|Junín|-11.98028|-74.89667
160302|Parinari|Loreto|Loreto|-4.63167|-74.46306
200701|Pariñas|Talara|Piura|-4.57944|-81.26944
021603|Parobamba|Pomabamba|Áncash|-8.69583|-77.42972
081001|Paruro|Paruro|Cusco|-13.76167|-71.84778
160705|Pastaza|Datem del Marañón|Loreto|-4.65111|-76.58750
211204|Patambuco|Sandia|Puno|-14.36167|-69.61944
140117|Patapo|Chiclayo|Lambayeque|-6.73556|-79.63472
030707|Pataypampa|Grau|Apurímac|-14.17750|-72.67250
130809|Pataz|Pataz|La Libertad|-7.78500|-77.59389
150203|Pativilca|Barranca|Lima|-10.69611|-77.78028
190204|Paucar|Daniel Alcides Carrión|Pasco|-10.37111|-76.44333
090206|Paucara|Acobamba|Huancavelica|-12.72972|-74.66639
090507|Paucarbamba|Churcampa|Huancavelica|-12.55389|-74.53194
210110|Paucarcolla|Puno|Puno|-15.74556|-70.05611
040112|Paucarpata|Arequipa|Arequipa|-16.43278|-71.50472
081101|Paucartambo|Paucartambo|Cusco|-13.31778|-71.59667
190107|Paucartambo|Pasco|Pasco|-10.77444|-75.81333
021010|Paucas|Huari|Áncash|-9.15250|-76.89944
050801|Pausa|Pàucar del Sara Sara|Ayacucho|-15.27861|-73.34417
090711|Pazos|Tayacaja|Huancavelica|-12.25944|-75.07056
160402|Pebas|Mariscal Ramón Castilla|Loreto|-3.32028|-71.86194
061001|Pedro Gálvez|San Marcos|Cajamarca|-7.33583|-78.17000
211003|Pedro Vilca Apaza|San Antonio de Putina|Puno|-15.06361|-69.88167
120302|Perene|Chanchamayo|Junín|-10.94750|-75.22472
211205|Phara|Sandia|Puno|-14.15194|-69.66528
130810|Pias|Pataz|La Libertad|-7.87194|-77.54667
210111|Pichacani|Puno|Puno|-16.15000|-70.06333
120303|Pichanaqui|Chanchamayo|Junín|-10.92639|-74.87278
080910|Pichari|La Convención|Cusco|-12.51944|-73.82917
080806|Pichigua|Espinar|Cusco|-14.67806|-71.40639
030107|Pichirhua|Abancay|Apurímac|-13.86083|-73.07333
090722|Pichos|Tayacaja|Huancavelica|-12.23639|-74.93861
220701|Picota|Picota|San Martín|-6.92000|-76.33028
140111|Picsi|Chiclayo|Lambayeque|-6.71833|-79.77056
090115|Pilchaca|Huancavelica|Huancavelica|-12.40139|-75.08389
120125|Pilcomayo|Huancayo|Junín|-12.04944|-75.25056
210503|Pilcuyo|El Collao|Puno|-16.11083|-69.55417
100111|Pillco Marca|Huánuco|Huánuco|-9.96083|-76.24917
081008|Pillpinto|Paruro|Cusco|-13.95361|-71.76056
220704|Pilluana|Picota|San Martín|-6.77667|-76.29167
090607|Pilpichaca|Huaytará|Huancavelica|-13.33028|-74.97722
140112|Pimentel|Chiclayo|Lambayeque|-6.83528|-79.93583
060606|Pimpingos|Cutervo|Cajamarca|-6.06194|-78.75861
100404|Pinra|Huacaybamba|Huánuco|-8.92472|-77.01500
220506|Pinto Recodo|Lamas|San Martín|-6.37917|-76.60444
060414|Pion|Chota|Cajamarca|-6.17778|-78.48250
020111|Pira|Huaraz|Áncash|-9.58111|-77.70722
080405|Pisac|Calca|Cusco|-13.42056|-71.85056
210405|Pisacoma|Chucuito|Puno|-16.90861|-69.37139
110501|Pisco|Pisco|Ica|-13.71000|-76.20167
021301|Piscobamba|Mariscal Luzuriaga|Áncash|-8.86500|-77.35778
220404|Piscoyacu|Huallaga|San Martín|-6.98111|-76.76944
010514|Pisuquia|Luya|Amazonas|-6.45333|-78.09194
140205|Pitipo|Ferreñafe|Lambayeque|-6.56583|-79.78083
080605|Pitumarca|Canchis|Cusco|-13.98028|-71.41750
200101|Piura|Piura|Piura|-5.15250|-80.65778
210112|Plateria|Puno|Puno|-15.94833|-69.83333
030410|Pocohuanca|Aymaraes|Apurímac|-14.21833|-73.08694
230108|Pocollay|Tacna|Tacna|-17.99667|-70.22583
040113|Pocsi|Arequipa|Arequipa|-16.51778|-71.38972
040114|Polobaya|Arequipa|Arequipa|-16.56583|-71.36833
221003|Polvora|Tocache|San Martín|-7.90778|-76.66778
021601|Pomabamba|Pomabamba|Áncash|-8.82111|-77.46028
120426|Pomacancha|Jauja|Junín|-11.73917|-75.62333
080205|Pomacanchi|Acomayo|Cusco|-14.03361|-71.57417
030211|Pomacocha|Andahuaylas|Apurímac|-14.08389|-73.59083
090207|Pomacocha|Acobamba|Huancavelica|-12.87389|-74.53167
060807|Pomahuaca|Jaén|Cajamarca|-5.93139|-79.22944
140118|Pomalca|Chiclayo|Lambayeque|-6.77000|-79.77528
210406|Pomata|Chucuito|Puno|-16.27361|-69.29278
021011|Ponto|Huari|Áncash|-9.32611|-77.00444
130108|Poroto|Trujillo|La Libertad|-8.01139|-78.76778
080103|Poroy|Cusco|Cusco|-13.49444|-72.04472
220806|Posic|Rioja|San Martín|-6.01333|-77.16194
210209|Potoni|Azángaro|Puno|-14.39000|-70.10500
190305|Pozuzo|Oxapampa|Pasco|-10.07111|-75.55028
030708|Progreso|Grau|Apurímac|-14.07222|-72.47667
010515|Providencia|Luya|Amazonas|-6.29722|-78.24083
220705|Pucacaca|Picota|San Martín|-6.84889|-76.34111
050411|Pucacolpa|Huanta|Ayacucho|-12.42056|-74.48917
140119|Pucala|Chiclayo|Lambayeque|-6.78194|-79.61222
060808|Pucara|Jaén|Cajamarca|-6.04139|-79.12833
120126|Pucara|Huancayo|Junín|-12.17250|-75.14556
210708|Pucara|Lampa|Puno|-15.04167|-70.36778
100607|Pucayacu|Leoncio Prado|Huánuco|-8.74972|-76.12111
150124|Pucusana|Lima|Lima|-12.48167|-76.79750
080308|Pucyura|Anta|Cusco|-13.47889|-72.11111
021207|Pueblo Libre|Huaylas|Áncash|-9.11000|-77.80194
150121|Pueblo Libre|Lima|Lima|-12.07806|-77.06250
100609|Pueblo Nuevo|Leoncio Prado|Huánuco|-9.07861|-76.06056
110107|Pueblo Nuevo|Ica|Ica|-14.12722|-75.70583
110207|Pueblo Nuevo|Chincha|Ica|-13.40417|-76.12750
130403|Pueblo Nuevo|Chepén|La Libertad|-7.18250|-79.52000
140206|Pueblo Nuevo|Ferreñafe|Lambayeque|-6.64028|-79.79611
150125|Puente Piedra|Lima|Lima|-11.86667|-77.07694
190306|Puerto Bermúdez|Oxapampa|Pasco|-10.29917|-74.93722
100901|Puerto Inca|Puerto Inca|Huánuco|-9.37889|-74.96583
160506|Puinahua|Requena|Loreto|-5.25556|-74.34556
061307|Pulan|Santa Cruz|Cajamarca|-6.73889|-78.92028
050705|Pullo|Parinacochas|Ayacucho|-15.21000|-73.82667
160108|Punchana|Maynas|Loreto|-3.72861|-73.24194
100508|Punchao|Huamalíes|Huánuco|-9.46222|-76.81972
210101|Puno|Puno|Puno|-15.84028|-70.02806
040706|Punta de Bombón|Islay|Arequipa|-17.15611|-71.78472
150126|Punta Hermosa|Lima|Lima|-12.33361|-76.82417
150127|Punta Negra|Lima|Lima|-12.36528|-76.79556
100509|Puños|Huamalíes|Huánuco|-9.50056|-76.88389
180208|Puquina|General Sánchez Cerro|Moquegua|-16.62528|-71.18389
050601|Puquio|Lucanas|Ayacucho|-14.69417|-74.12444
250401|Purús|Purús|Ucayali|-9.77222|-70.70972
210605|Pusi|Huancané|Puno|-15.44194|-69.92972
211001|Putina|San Antonio de Putina|Puno|-14.91417|-69.86889
151023|Putinza|Yauyos|Lima|-12.66806|-75.94944
160801|Putumayo|Putumayo|Loreto|-2.44694|-72.66806
040806|Puyca|La Uniòn|Arequipa|-15.05917|-72.69167
050706|Puyusca|Parinacochas|Ayacucho|-15.24694|-73.56944
040807|Quechualla|La Uniòn|Arequipa|-15.27389|-73.02222
080507|Quehue|Canas|Cusco|-14.38028|-71.45556
080906|Quellouno|La Convención|Cusco|-12.63667|-72.55722
040115|Quequeña|Arequipa|Arequipa|-16.55722|-71.45139
090608|Querco|Huaytará|Huancavelica|-13.97944|-74.97694
200607|Querecotillo|Sullana|Piura|-4.83917|-80.64833
050901|Querobamba|Sucre|Ayacucho|-14.01167|-73.83861
060607|Querocotillo|Cutervo|Cajamarca|-6.27361|-79.03778
060415|Querocoto|Chota|Cajamarca|-6.35972|-79.03444
101004|Queropalca|Lauricocha|Huánuco|-10.18139|-76.80306
211206|Quiaca|Sandia|Puno|-14.42222|-69.34500
040312|Quicacha|Caravelí|Arequipa|-15.62500|-73.79833
021907|Quiches|Sihuas|Áncash|-8.39500|-77.49111
090719|Quichuas|Tayacaja|Huancavelica|-12.47250|-74.76750
120127|Quichuay|Huancayo|Junín|-11.88972|-75.28611
230206|Quilahuani|Candarave|Tacna|-17.31833|-70.25861
040207|Quilca|Camaná|Arequipa|-16.71694|-72.42556
211004|Quilcapuncu|San Antonio de Putina|Puno|-14.89361|-69.73028
120128|Quilcas|Huancayo|Junín|-11.93806|-75.25972
022005|Quillo|Yungay|Áncash|-9.32861|-78.04167
150512|Quilmana|Cañete|Lima|-12.94944|-76.38278
151024|Quinches|Yauyos|Lima|-12.30778|-76.14333
180209|Quinistaquillas|General Sánchez Cerro|Moquegua|-16.74889|-70.88028
010117|Quinjalca|Chachapoyas|Amazonas|-6.09139|-77.67861
151025|Quinocay|Yauyos|Lima|-12.36222|-76.22639
050108|Quinua|Huamanga|Ayacucho|-13.04917|-74.13917
021604|Quinuabamba|Pomabamba|Áncash|-8.69722|-77.39833
080707|Quiñota|Chumbivilcas|Cusco|-14.31111|-72.13861
081212|Quiquijana|Quispicanchi|Cusco|-13.82250|-71.54250
131006|Quiruvilca|Santiago de Chuco|La Libertad|-8.00194|-78.31000
090713|Quishuar|Tayacaja|Huancavelica|-12.24361|-74.77722
100106|Quisqui (Kichki)|Huánuco|Huánuco|-9.90472|-76.39250
090609|Quito-Arma|Huaytará|Huancavelica|-13.52861|-75.32750
100316|Quivilla|Dos de Mayo|Huánuco|-9.60000|-76.72583
021908|Ragash|Sihuas|Áncash|-8.53167|-77.66583
021012|Rahuapampa|Huari|Áncash|-9.35917|-77.07861
160401|Ramón Castilla|Mariscal Ramón Castilla|Loreto|-3.90611|-70.51694
030608|Ranracancha|Chincheros|Apurímac|-13.53250|-73.60556
022006|Ranrahirca|Yungay|Áncash|-9.17306|-77.72250
021013|Rapayan|Huari|Áncash|-9.20250|-76.75944
250201|Raymondi|Atalaya|Ucayali|-10.72972|-73.75528
130206|Rázuri|Ascope|La Libertad|-7.70222|-79.43778
010308|Recta|Bongará|Amazonas|-5.91778|-77.78889
021701|Recuay|Recuay|Áncash|-9.72167|-77.45639
140113|Reque|Chiclayo|Lambayeque|-6.86500|-79.81917
160501|Requena|Requena|Loreto|-5.06389|-73.85667
150714|Ricardo Palma|Huarochirí|Lima|-11.92361|-76.66500
120427|Ricran|Jauja|Junín|-11.53944|-75.52722
150128|Rímac|Lima|Lima|-12.04222|-77.02694
200806|Rinconada Llicuar|Sechura|Piura|-5.46361|-80.76528
040606|Río Grande|Condesuyos|Arequipa|-15.94000|-73.13111
110403|Río Grande|Palpa|Ica|-14.52000|-75.20111
120607|Río Negro|Satipo|Junín|-11.20889|-74.65944
010403|Río Santiago|Condorcanqui|Amazonas|-4.01583|-77.76083
120608|Río Tambo|Satipo|Junín|-11.14750|-74.30639
220801|Rioja|Rioja|San Martín|-6.06250|-77.16833
100317|Ripan|Dos de Mayo|Huánuco|-9.82861|-76.80306
090721|Roble|Tayacaja|Huancavelica|-12.21667|-74.48972
030609|Rocchacc|Chincheros|Apurímac|-13.44056|-73.60000
080206|Rondocan|Acomayo|Cusco|-13.77944|-71.78194
101005|Rondos|Lauricocha|Huánuco|-9.98444|-76.68833
160802|Rosa Panduro|Putumayo|Loreto|-1.78861|-73.41306
090208|Rosario|Acobamba|Huancavelica|-12.72083|-74.58250
210606|Rosaspata|Huancané|Puno|-15.23472|-69.52750
220507|Rumisapa|Lamas|San Martín|-6.44889|-76.47167
100601|Rupa-Rupa|Leoncio Prado|Huánuco|-9.29806|-76.00056
030307|Sabaino|Antabamba|Apurímac|-14.31333|-72.94528
040116|Sabandia|Arequipa|Arequipa|-16.45694|-71.49472
220405|Sacanche|Huallaga|San Martín|-7.07000|-76.71361
040117|Sachaca|Arequipa|Arequipa|-16.42444|-71.56639
050303|Sacsamarca|Huanca Sancos|Ayacucho|-13.94278|-74.31278
050614|Saisa|Lucanas|Ayacucho|-14.94028|-74.41722
040607|Salamanca|Condesuyos|Arequipa|-15.50444|-72.83444
110108|Salas|Ica|Ica|-13.98583|-75.77222
140310|Salas|Lambayeque|Lambayeque|-6.27472|-79.60722
130109|Salaverry|Trujillo|La Libertad|-8.22444|-78.97611
090714|Salcabamba|Tayacaja|Huancavelica|-12.20167|-74.78056
090715|Salcahuasi|Tayacaja|Huancavelica|-12.10417|-74.75167
200406|Salitral|Morropón|Piura|-5.34194|-79.83361
200608|Salitral|Sullana|Piura|-4.85694|-80.68083
060809|Sallique|Jaén|Cajamarca|-5.65806|-79.31528
130611|Salpo|Otuzco|La Libertad|-8.00306|-78.60417
230109|Sama|Tacna|Tacna|-17.86250|-70.56000
210210|Saman|Azángaro|Puno|-15.29194|-70.01722
021807|Samanco|Santa|Áncash|-9.26222|-78.49583
180104|Samegua|Mariscal Nieto|Moquegua|-17.18222|-70.90028
040208|Samuel Pastor|Camaná|Arequipa|-16.61361|-72.69917
050509|Samugari|La Mar|Ayacucho|-12.76833|-73.65556
120129|San Agustín|Huancayo|Junín|-11.98972|-75.24417
110506|San Andrés|Pisco|Ica|-13.73139|-76.22333
060608|San Andrés de Cutervo|Cutervo|Cajamarca|-6.23889|-78.71278
150715|San Andrés de Tupicocha|Huarochirí|Lima|-12.00222|-76.47472
210211|San Anton|Azángaro|Puno|-14.58389|-70.31722
030709|San Antonio|Grau|Apurímac|-14.16944|-72.62333
150513|San Antonio|Cañete|Lima|-12.64222|-76.64944
150716|San Antonio|Huarochirí|Lima|-11.74361|-76.65000
210113|San Antonio|Puno|Puno|-16.14056|-70.34389
220912|San Antonio|San Martín|San Martín|-6.40944|-76.40667
090310|San Antonio de Antaparco|Angaraes|Huancavelica|-13.07611|-74.41167
030212|San Antonio de Cachi|Andahuaylas|Apurímac|-13.77306|-73.60333
040514|San Antonio de Chuca|Caylloma|Arequipa|-15.83889|-71.09056
090610|San Antonio de Cusicancha|Huaytará|Huancavelica|-13.50250|-75.29333
150129|San Bartolo|Lima|Lima|-12.38917|-76.78083
150717|San Bartolomé|Huarochirí|Lima|-11.91194|-76.52917
060505|San Benito|Contumazá|Cajamarca|-7.42500|-78.92750
061202|San Bernardino|San Pablo|Cajamarca|-7.16806|-78.82917
150130|San Borja|Lima|Lima|-12.10722|-76.99889
100703|San Buenaventura|Marañón|Huánuco|-8.76778|-77.18611
150406|San Buenaventura|Canta|Lima|-11.48917|-76.66222
010309|San Carlos|Bongará|Amazonas|-5.96611|-77.94528
110507|San Clemente|Pisco|Ica|-13.68028|-76.15694
010516|San Cristóbal|Luya|Amazonas|-6.10167|-77.95972
050615|San Cristóbal|Lucanas|Ayacucho|-14.74306|-74.22222
180105|San Cristóbal|Mariscal Nieto|Moquegua|-16.73917|-70.68333
220706|San Cristóbal|Picota|San Martín|-6.99194|-76.41778
021408|San Cristóbal de Rajan|Ocros|Áncash|-10.38694|-77.21944
150718|San Damian|Huarochirí|Lima|-12.01778|-76.39194
060810|San Felipe|Jaén|Cajamarca|-5.77028|-79.31389
220807|San Fernando|Rioja|San Martín|-5.90194|-77.26944
100206|San Francisco|Ambo|Huánuco|-10.34278|-76.29194
101006|San Francisco de Asís|Lauricocha|Huánuco|-9.97639|-76.67694
190108|San Francisco de Asís de Yarusyacan|Pasco|Pasco|-10.49000|-76.19611
100107|San Francisco de Cayran|Huánuco|Huánuco|-9.98083|-76.28417
010118|San Francisco de Daguas|Chachapoyas|Amazonas|-6.22917|-77.74000
050707|San Francisco de Ravacayco|Parinacochas|Ayacucho|-14.99694|-73.35111
090611|San Francisco de Sangayaico|Huaytará|Huancavelica|-13.79528|-75.24917
010517|San Francisco de Yeso|Luya|Amazonas|-6.64694|-77.81167
210309|San Gaban|Carabaya|Puno|-13.43833|-70.40278
061110|San Gregorio|San Miguel|Cajamarca|-7.05694|-79.09528
220707|San Hilarión|Picota|San Martín|-7.00389|-76.43944
060901|San Ignacio|San Ignacio|Cajamarca|-5.14611|-79.00472
090612|San Isidro|Huaytará|Huancavelica|-13.95639|-75.23806
150131|San Isidro|Lima|Lima|-12.09778|-77.02722
010119|San Isidro de Maino|Chachapoyas|Amazonas|-6.33722|-77.88056
240105|San Jacinto|Tumbes|Tumbes|-3.64083|-80.44528
050808|San Javier de Alpabamba|Pàucar del Sara Sara|Ayacucho|-15.05667|-73.32222
010518|San Jerónimo|Luya|Amazonas|-6.05972|-77.97444
030213|San Jerónimo|Andahuaylas|Apurímac|-13.65167|-73.36583
080104|San Jerónimo|Cusco|Cusco|-13.54444|-71.88361
120130|San Jerónimo de Tunan|Huancayo|Junín|-11.94917|-75.28222
151026|San Joaquín|Yauyos|Lima|-12.28389|-76.14694
130705|San José|Pacasmayo|La Libertad|-7.35000|-79.45528
140311|San José|Lambayeque|Lambayeque|-6.76944|-79.96806
210212|San José|Azángaro|Puno|-14.68028|-70.16000
110109|San José de Los Molinos|Ica|Ica|-13.93306|-75.67083
060906|San José de Lourdes|San Ignacio|Cajamarca|-5.10306|-78.91417
120214|San José de Quero|Concepción|Junín|-12.08556|-75.53639
220301|San José de Sisa|El Dorado|San Martín|-6.61389|-76.69528
050109|San José de Ticllas|Huamanga|Ayacucho|-13.13222|-74.33306
050809|San José de Ushua|Pàucar del Sara Sara|Ayacucho|-15.22500|-73.22667
060811|San José del Alto|Jaén|Cajamarca|-5.46500|-79.01778
021909|San Juan|Sihuas|Áncash|-8.64639|-77.58194
050616|San Juan|Lucanas|Ayacucho|-14.65167|-74.19917
060112|San Juan|Cajamarca|Cajamarca|-7.29167|-78.49750
090410|San Juan|Castrovirreyna|Huancavelica|-13.20389|-75.63444
050110|San Juan Bautista|Huamanga|Ayacucho|-13.16667|-74.22361
110110|San Juan Bautista|Ica|Ica|-14.01139|-75.73528
160113|San Juan Bautista|Maynas|Loreto|-3.77028|-73.28028
200407|San Juan de Bigote|Morropón|Piura|-5.31944|-79.78611
030411|San Juan de Chacña|Aymaraes|Apurímac|-13.92417|-73.18222
060609|San Juan de Cutervo|Cutervo|Cajamarca|-6.16306|-78.59806
150719|San Juan de Iris|Huarochirí|Lima|-11.68306|-76.52500
120906|San Juan de Iscos|Chupaca|Junín|-12.09833|-75.29278
120907|San Juan de Jarpa|Chupaca|Junín|-12.12639|-75.43556
240106|San Juan de la Virgen|Tumbes|Tumbes|-3.62778|-80.43361
060416|San Juan de Licupis|Chota|Cajamarca|-6.42417|-79.24222
010519|San Juan de Lopecancha|Luya|Amazonas|-6.13917|-77.95222
150132|San Juan de Lurigancho|Lima|Lima|-12.02972|-77.01000
150133|San Juan de Miraflores|Lima|Lima|-12.16361|-76.96361
020306|San Juan de Rontoy|Antonio Raymondi|Áncash|-9.17528|-77.00278
210213|San Juan de Salinas|Azángaro|Puno|-14.99139|-70.10611
040118|San Juan de Siguas|Arequipa|Arequipa|-16.34611|-72.12833
150720|San Juan de Tantaranche|Huarochirí|Lima|-12.11361|-76.18250
040119|San Juan de Tarucani|Arequipa|Arequipa|-16.18361|-71.06194
110208|San Juan de Yanac|Chincha|Ica|-13.21111|-75.78722
211207|San Juan del Oro|Sandia|Puno|-14.22083|-69.15361
120428|San Lorenzo|Jauja|Junín|-11.84639|-75.38167
150721|San Lorenzo de Quinti|Huarochirí|Lima|-12.14528|-76.21250
020701|San Luis|Carlos Fermín Fitzcarrald|Áncash|-9.09417|-77.32889
061203|San Luis|San Pablo|Cajamarca|-7.15694|-78.86806
150134|San Luis|Lima|Lima|-12.07556|-76.99361
150514|San Luis|Cañete|Lima|-13.05111|-76.43111
060610|San Luis de Lucma|Cutervo|Cajamarca|-6.29389|-78.60361
120304|San Luis de Shuaro|Chanchamayo|Junín|-10.88833|-75.28722
021014|San Marcos|Huari|Áncash|-9.52417|-77.15694
090716|San Marcos de Rocchac|Tayacaja|Huancavelica|-12.09389|-74.86389
220303|San Martín|El Dorado|San Martín|-6.51444|-76.74056
150135|San Martín de Porres|Lima|Lima|-12.03000|-77.05750
150722|San Mateo|Huarochirí|Lima|-11.75917|-76.30056
150723|San Mateo de Otao|Huarochirí|Lima|-11.87028|-76.54389
050501|San Miguel|La Mar|Ayacucho|-13.01278|-73.98111
061101|San Miguel|San Miguel|Cajamarca|-7.00000|-78.85000
150136|San Miguel|Lima|Lima|-12.09222|-77.07944
211105|San Miguel|San Román|Puno|-15.46028|-70.12694
020608|San Miguel de Aco|Carhuaz|Áncash|-9.36833|-77.56444
150609|San Miguel de Acos|Huaral|Lima|-11.27389|-76.82194
101007|San Miguel de Cauri|Lauricocha|Huánuco|-10.14250|-76.62556
030214|San Miguel de Chaccrampa|Andahuaylas|Apurímac|-13.96111|-73.60778
020514|San Miguel de Corpanqui|Bolognesi|Áncash|-10.28500|-77.19889
200306|San Miguel de El Faique|Huancabamba|Piura|-5.40194|-79.60611
090508|San Miguel de Mayocc|Churcampa|Huancavelica|-12.80583|-74.39000
010601|San Nicolás|Rodríguez de Mendoza|Amazonas|-6.39528|-77.48222
020702|San Nicolás|Carlos Fermín Fitzcarrald|Áncash|-8.97583|-77.18917
061201|San Pablo|San Pablo|Cajamarca|-7.11861|-78.82333
080606|San Pablo|Canchis|Cusco|-14.20222|-71.31500
160404|San Pablo|Mariscal Ramón Castilla|Loreto|-4.02028|-71.10306
220205|San Pablo|Bellavista|San Martín|-6.80972|-76.57472
100113|San Pablo de Pillao|Huánuco|Huánuco|-9.78639|-75.99944
021409|San Pedro|Ocros|Áncash|-10.37194|-77.48722
050617|San Pedro|Lucanas|Ayacucho|-14.76694|-74.09778
080607|San Pedro|Canchis|Cusco|-14.18611|-71.34306
030108|San Pedro de Cachora|Abancay|Apurímac|-13.51417|-72.81417
120708|San Pedro de Cajas|Tarma|Junín|-11.24917|-75.86278
150724|San Pedro de Casta|Huarochirí|Lima|-11.75889|-76.59639
021015|San Pedro de Chana|Huari|Áncash|-9.40306|-77.01111
100108|San Pedro de Chaulan|Huánuco|Huánuco|-10.05639|-76.48556
120429|San Pedro de Chunan|Jauja|Junín|-11.72556|-75.48639
090509|San Pedro de Coris|Churcampa|Huancavelica|-12.57806|-74.41167
110209|San Pedro de Huacarpana|Chincha|Ica|-13.04917|-75.64778
150725|San Pedro de Huancayre|Huarochirí|Lima|-12.13139|-76.21556
050908|San Pedro de Larcay|Sucre|Ayacucho|-14.16861|-73.57278
130701|San Pedro de Lloc|Pacasmayo|La Libertad|-7.41833|-79.51472
050618|San Pedro de Palco|Lucanas|Ayacucho|-14.41194|-74.65139
151027|San Pedro de Pilas|Yauyos|Lima|-12.45444|-76.22694
190205|San Pedro de Pillao|Daniel Alcides Carrión|Pasco|-10.43889|-76.49528
211210|San Pedro de Putina Punco|Sandia|Puno|-14.11250|-69.04778
100207|San Rafael|Ambo|Huánuco|-10.33778|-76.18222
220206|San Rafael|Bellavista|San Martín|-7.02306|-76.46583
120305|San Ramón|Chanchamayo|Junín|-11.12056|-75.35306
220508|San Roque de Cumbaza|Lamas|San Martín|-6.38556|-76.43861
080406|San Salvador|Calca|Cusco|-13.49194|-71.77861
050909|San Salvador de Quije|Sucre|Ayacucho|-13.96833|-73.73472
080105|San Sebastian|Cusco|Cusco|-13.53028|-71.93694
061111|San Silvestre de Cochan|San Miguel|Cajamarca|-6.97750|-78.77389
150501|San Vicente de Cañete|Cañete|Lima|-13.07778|-76.38778
130906|Sanagoran|Sánchez Carrión|La Libertad|-7.78611|-78.14194
050301|Sancos|Huanca Sancos|Ayacucho|-13.91972|-74.33417
050619|Sancos|Lucanas|Ayacucho|-15.06278|-73.95222
211201|Sandia|Sandia|Puno|-14.32222|-69.46639
150726|Sangallaya|Huarochirí|Lima|-12.16083|-76.22889
080207|Sangarara|Acomayo|Cusco|-13.94722|-71.60333
021808|Santa|Santa|Áncash|-8.98778|-78.61306
080901|Santa Ana|La Convención|Cusco|-12.86278|-72.69333
090411|Santa Ana|Castrovirreyna|Huancavelica|-13.07194|-75.14028
050620|Santa Ana de Huaycahuacho|Lucanas|Ayacucho|-14.22639|-73.95667
190206|Santa Ana de Tusi|Daniel Alcides Carrión|Pasco|-10.47250|-76.35361
150137|Santa Anita|Lima|Lima|-12.04389|-76.97139
120807|Santa Bárbara de Carhuacayan|Yauli|Junín|-11.20389|-76.28556
010520|Santa Catalina|Luya|Amazonas|-6.11361|-78.06083
200408|Santa Catalina de Mossa|Morropón|Piura|-5.10278|-79.88500
021208|Santa Cruz|Huaylas|Áncash|-8.95194|-77.81500
060611|Santa Cruz|Cutervo|Cajamarca|-6.09500|-78.85278
061301|Santa Cruz|Santa Cruz|Cajamarca|-6.62583|-78.94417
110404|Santa Cruz|Palpa|Ica|-14.48333|-75.24556
160210|Santa Cruz|Alto Amazonas|Loreto|-5.51333|-75.85889
150610|Santa Cruz de Andamarca|Huaral|Lima|-11.19472|-76.63444
131007|Santa Cruz de Chuca|Santiago de Chuco|La Libertad|-8.12028|-78.14222
150727|Santa Cruz de Cocachacra|Huarochirí|Lima|-11.91167|-76.53944
150515|Santa Cruz de Flores|Cañete|Lima|-12.61972|-76.63972
060506|Santa Cruz de Toledo|Contumazá|Cajamarca|-7.34444|-78.83667
150728|Santa Eulalia|Huarochirí|Lima|-11.90167|-76.66389
040120|Santa Isabel de Siguas|Arequipa|Arequipa|-16.32083|-72.09889
150809|Santa Leonor|Huaura|Lima|-10.94861|-76.74500
050621|Santa Lucia|Lucanas|Ayacucho|-14.97833|-74.52389
210709|Santa Lucia|Lampa|Puno|-15.69944|-70.60639
150810|Santa María|Huaura|Lima|-11.09667|-77.59500
030215|Santa María de Chicmo|Andahuaylas|Apurímac|-13.65750|-73.49389
150138|Santa María del Mar|Lima|Lima|-12.40194|-76.77333
100109|Santa María del Valle|Huánuco|Huánuco|-9.86250|-76.17000
040121|Santa Rita de Siguas|Arequipa|Arequipa|-16.49361|-72.09472
010610|Santa Rosa|Rodríguez de Mendoza|Amazonas|-6.39528|-77.48222
021510|Santa Rosa|Pallasca|Áncash|-8.52778|-78.06750
030710|Santa Rosa|Grau|Apurímac|-14.13972|-72.65667
050507|Santa Rosa|La Mar|Ayacucho|-12.68778|-73.73583
060812|Santa Rosa|Jaén|Cajamarca|-5.43417|-78.56667
140114|Santa Rosa|Chiclayo|Lambayeque|-6.88167|-79.92083
150139|Santa Rosa|Lima|Lima|-11.78722|-77.15694
210504|Santa Rosa|El Collao|Puno|-16.74222|-69.71667
210808|Santa Rosa|Melgar|Puno|-14.60750|-70.78778
220304|Santa Rosa|El Dorado|San Martín|-6.74639|-76.62361
100705|Santa Rosa de Alto Yanajanca|Marañón|Huánuco|-8.65278|-76.31472
120215|Santa Rosa de Ocopa|Concepción|Junín|-11.87722|-75.29500
150407|Santa Rosa de Quives|Canta|Lima|-11.69528|-76.84611
120808|Santa Rosa de Sacco|Yauli|Junín|-11.54917|-75.94028
080908|Santa Teresa|La Convención|Cusco|-13.13056|-72.59389
080106|Santiago|Cusco|Cusco|-13.52583|-71.98306
110111|Santiago|Ica|Ica|-14.18583|-75.71444
150729|Santiago de Anchucaya|Huarochirí|Lima|-12.09556|-76.23056
130207|Santiago de Cao|Ascope|La Libertad|-7.95778|-79.24361
130811|Santiago de Challas|Pataz|La Libertad|-8.43806|-77.32056
021410|Santiago de Chilcas|Ocros|Áncash|-10.43861|-77.36583
090613|Santiago de Chocorvos|Huaytará|Huancavelica|-13.82528|-75.25750
131001|Santiago de Chuco|Santiago de Chuco|La Libertad|-8.14528|-78.17361
050304|Santiago de Lucanamarca|Huanca Sancos|Ayacucho|-13.84389|-74.37222
050910|Santiago de Paucaray|Sucre|Ayacucho|-14.04444|-73.63750
050111|Santiago de Pischa|Huamanga|Ayacucho|-13.08556|-74.39333
210214|Santiago de Pupuja|Azángaro|Puno|-15.05278|-70.27806
090614|Santiago de Quirahuara|Huaytará|Huancavelica|-14.05611|-74.97639
150140|Santiago de Surco|Lima|Lima|-12.14500|-77.00500
090723|Santiago de Tucuma|Tayacaja|Huancavelica|-12.31417|-74.89000
150730|Santiago de Tuna|Huarochirí|Lima|-11.98389|-76.52528
050406|Santillana|Huanta|Ayacucho|-12.76639|-74.25306
200409|Santo Domingo|Morropón|Piura|-5.02944|-79.87583
120135|Santo Domingo de Acobamba|Huancayo|Junín|-11.76889|-74.79528
100610|Santo Domingo de Anda|Leoncio Prado|Huánuco|-9.02361|-76.06667
090615|Santo Domingo de Capillas|Huaytará|Huancavelica|-13.73722|-75.24361
060612|Santo Domingo de la Capilla|Cutervo|Cajamarca|-6.24472|-78.85528
150731|Santo Domingo de Los Olleros|Huarochirí|Lima|-12.21889|-76.51417
010521|Santo Tomas|Luya|Amazonas|-6.57250|-77.86583
060613|Santo Tomas|Cutervo|Cajamarca|-6.15139|-78.68194
080701|Santo Tomas|Chumbivilcas|Cusco|-14.45333|-72.08222
090311|Santo Tomas de Pata|Angaraes|Huancavelica|-13.11306|-74.41889
021209|Santo Toribio|Huaylas|Áncash|-8.86444|-77.91472
140115|Saña|Chiclayo|Lambayeque|-6.91806|-79.58333
030412|Sañayca|Aymaraes|Apurímac|-14.20444|-73.34694
120132|Saño|Huancayo|Junín|-11.95889|-75.25861
120133|Sapallanga|Huancayo|Junín|-12.14139|-75.15806
200208|Sapillica|Ayabaca|Piura|-4.77917|-79.98222
220401|Saposoa|Huallaga|San Martín|-6.93667|-76.77222
160507|Saquena|Requena|Loreto|-4.72500|-73.53306
050810|Sara Sara|Pàucar del Sara Sara|Ayacucho|-15.24528|-73.45306
160605|Sarayacu|Ucayali|Loreto|-6.39306|-75.11694
051011|Sarhua|Víctor Fajardo|Ayacucho|-13.67278|-74.32028
130907|Sarin|Sánchez Carrión|La Libertad|-7.91139|-77.90611
130908|Sartimbamba|Sánchez Carrión|La Libertad|-7.69917|-77.74361
120601|Satipo|Satipo|Junín|-11.25389|-74.63611
220913|Sauce|San Martín|San Martín|-6.69056|-76.21667
061308|Saucepampa|Santa Cruz|Cajamarca|-6.69139|-78.91611
051107|Saurama|Vilcas Huamán|Ayacucho|-13.69556|-73.75944
120430|Sausa|Jauja|Junín|-11.79361|-75.48472
150811|Sayan|Huaura|Lima|-11.13528|-77.19361
131104|Sayapullo|Gran Chimú|La Libertad|-7.59583|-78.46500
040808|Sayla|La Uniòn|Arequipa|-15.32000|-73.22194
080107|Saylla|Cusco|Cusco|-13.57000|-71.82778
090312|Secclla|Angaraes|Huancavelica|-13.05111|-74.48361
200801|Sechura|Sechura|Piura|-5.55722|-80.82222
250202|Sepahua|Atalaya|Ucayali|-11.13722|-73.04556
061309|Sexi|Santa Cruz|Cajamarca|-6.56417|-79.05139
220708|Shamboyacu|Picota|San Martín|-7.02417|-76.13278
220509|Shanao|Lamas|San Martín|-6.41167|-76.59417
220914|Shapaja|San Martín|San Martín|-6.57972|-76.26194
220305|Shatoja|El Dorado|San Martín|-6.52833|-76.72000
020609|Shilla|Carhuaz|Áncash|-9.23167|-77.62500
010310|Shipasbamba|Bongará|Amazonas|-5.91056|-77.98056
100321|Shunqui|Dos de Mayo|Huánuco|-9.73111|-76.78333
221004|Shunte|Tocache|San Martín|-8.35167|-76.72972
022007|Shupluy|Yungay|Áncash|-9.21694|-77.69389
040515|Sibayo|Caylloma|Arequipa|-15.48611|-71.45694
120134|Sicaya|Huancayo|Junín|-12.01472|-75.28000
200209|Sicchez|Ayabaca|Piura|-4.57000|-79.76389
021910|Sicsibamba|Sihuas|Áncash|-8.62333|-77.53556
080601|Sicuani|Canchis|Cusco|-14.23806|-71.23083
021901|Sihuas|Sihuas|Áncash|-8.55444|-77.63083
100322|Sillapata|Dos de Mayo|Huánuco|-9.75722|-76.77472
130110|Simbal|Trujillo|La Libertad|-7.97667|-78.81333
190109|Simon Bolívar|Pasco|Pasco|-10.68917|-76.31639
211005|Sina|San Antonio de Putina|Puno|-14.49667|-69.28028
120431|Sincos|Jauja|Junín|-11.89139|-75.38694
100510|Singa|Huamalíes|Huánuco|-9.38861|-76.81250
130613|Sinsicap|Otuzco|La Libertad|-7.85167|-78.75417
131008|Sitabamba|Santiago de Chuco|La Libertad|-8.02222|-77.73000
060204|Sitacocha|Cajabamba|Cajamarca|-7.51944|-77.96944
230405|Sitajara|Tarata|Tacna|-17.37528|-70.13389
050407|Sivia|Huanta|Ayacucho|-12.51194|-73.85889
040122|Socabaya|Arequipa|Arequipa|-16.46750|-71.52861
050112|Socos|Huamanga|Ayacucho|-13.21500|-74.28944
060614|Socota|Cutervo|Cajamarca|-6.31528|-78.69944
010120|Soloco|Chachapoyas|Amazonas|-6.26056|-77.74417
010121|Sonche|Chachapoyas|Amazonas|-6.21889|-77.77528
200307|Sondor|Huancabamba|Piura|-5.31556|-79.40972
200308|Sondorillo|Huancabamba|Piura|-5.33944|-79.42861
160508|Soplin|Requena|Loreto|-6.00778|-73.69250
050911|Soras|Sucre|Ayacucho|-14.11444|-73.60444
030413|Soraya|Aymaraes|Apurímac|-14.16472|-73.31500
220105|Soritor|Moyobamba|San Martín|-6.13944|-77.10250
060309|Sorochuco|Celendín|Cajamarca|-6.91194|-78.25528
110112|Subtanjalla|Ica|Ica|-14.01861|-75.75806
020205|Succha|Aija|Áncash|-9.82306|-77.64972
060310|Sucre|Celendín|Cajamarca|-6.94278|-78.13528
120809|Suitucancha|Yauli|Junín|-11.78750|-75.93639
200601|Sullana|Sullana|Piura|-4.89056|-80.68778
150611|Sumbilca|Huaral|Lima|-11.40667|-76.81972
110210|Sunampe|Chincha|Ica|-13.42750|-76.16361
150204|Supe|Barranca|Lima|-10.79611|-77.71611
150205|Supe Puerto|Barranca|Lima|-10.80167|-77.74472
150732|Surco|Huarochirí|Lima|-11.88250|-76.43611
090717|Surcubamba|Tayacaja|Huancavelica|-12.11639|-74.63056
150141|Surquillo|Lima|Lima|-12.11861|-77.02167
230406|Susapaya|Tarata|Tacna|-17.34806|-70.13361
080807|Suyckutambo|Espinar|Cusco|-15.00861|-71.64333
200210|Suyo|Ayabaca|Piura|-4.51278|-80.00250
060907|Tabaconas|San Ignacio|Cajamarca|-5.31611|-79.28333
220510|Tabalosos|Lamas|San Martín|-6.38944|-76.63417
060417|Tacabamba|Chota|Cajamarca|-6.39278|-78.61139
230101|Tacna|Tacna|Tacna|-18.00194|-70.25194
170303|Tahuamanu|Tahuamanu|Madre de Dios|-11.45472|-69.32139
250203|Tahuania|Atalaya|Ucayali|-10.03056|-73.95639
030216|Talavera|Andahuaylas|Apurímac|-13.65417|-73.42889
200506|Tamarindo|Paita|Piura|-4.87833|-80.97583
050113|Tambillo|Huamanga|Ayacucho|-13.19472|-74.11056
050508|Tambo|La Mar|Ayacucho|-12.94806|-74.02083
090616|Tambo|Huaytará|Huancavelica|-13.68944|-75.27500
110211|Tambo de Mora|Chincha|Ica|-13.46056|-76.17667
200114|Tambo Grande|Piura|Piura|-4.92806|-80.33722
030501|Tambobamba|Cotabambas|Apurímac|-13.94611|-72.17472
170101|Tambopata|Tambopata|Madre de Dios|-12.59361|-69.17667
030109|Tamburco|Abancay|Apurímac|-13.62222|-72.87333
151028|Tanta|Yauyos|Lima|-12.12222|-76.01333
100511|Tantamayo|Huamalíes|Huánuco|-9.39250|-76.72000
090412|Tantara|Castrovirreyna|Huancavelica|-13.07417|-75.64472
060507|Tantarica|Contumazá|Cajamarca|-7.30056|-78.93306
021709|Tapacocha|Recuay|Áncash|-10.01028|-77.56917
030414|Tapairihua|Aymaraes|Apurímac|-14.14139|-73.14028
040516|Tapay|Caylloma|Arequipa|-15.57750|-71.93972
160509|Tapiche|Requena|Loreto|-5.69361|-74.13778
120709|Tapo|Tarma|Junín|-11.39028|-75.56389
190207|Tapuc|Daniel Alcides Carrión|Pasco|-10.45472|-76.46250
210607|Taraco|Huancané|Puno|-15.29722|-69.97833
220901|Tarapoto|San Martín|San Martín|-6.48944|-76.36028
230401|Tarata|Tarata|Tacna|-17.47500|-70.03194
080407|Taray|Calca|Cusco|-13.42778|-71.86694
020112|Tarica|Huaraz|Áncash|-9.39361|-77.57500
120701|Tarma|Tarma|Junín|-11.42000|-75.68806
230407|Tarucachi|Tarata|Tacna|-17.52583|-70.03167
110113|Tate|Ica|Ica|-14.15583|-75.70806
021511|Tauca|Pallasca|Áncash|-8.47028|-78.03778
040809|Tauria|La Uniòn|Arequipa|-15.35417|-73.23250
130812|Taurija|Pataz|La Libertad|-8.30778|-77.42361
151029|Tauripampa|Yauyos|Lima|-12.61722|-76.16194
130801|Tayabamba|Pataz|La Libertad|-8.27500|-77.29611
160211|Teniente Cesar López Rojas|Alto Amazonas|Loreto|-6.02556|-75.87417
160803|Teniente Manuel Clavero|Putumayo|Loreto|-0.37333|-74.67583
040123|Tiabaya|Arequipa|Arequipa|-16.44944|-71.59167
110405|Tibillo|Palpa|Ica|-14.09389|-75.17167
230408|Ticaco|Tarata|Tacna|-17.44722|-70.04667
021710|Ticapampa|Recuay|Áncash|-9.76056|-77.44278
190110|Ticlacayan|Pasco|Pasco|-10.53500|-76.16417
020515|Ticllos|Bolognesi|Áncash|-10.25306|-77.19083
090413|Ticrapo|Castrovirreyna|Huancavelica|-13.38250|-75.43250
160303|Tigre|Loreto|Loreto|-3.48972|-74.78167
210904|Tilali|Moho|Puno|-15.51500|-69.34806
020610|Tinco|Carhuaz|Áncash|-9.27083|-77.67750
010522|Tingo|Luya|Amazonas|-6.37972|-77.90583
220709|Tingo de Ponasa|Picota|San Martín|-6.93611|-76.25389
220406|Tingo de Saposoa|Huallaga|San Martín|-7.09194|-76.64139
211306|Tinicachi|Yunguyo|Puno|-16.19861|-68.96167
080608|Tinta|Canchis|Cusco|-14.14528|-71.40722
030415|Tintay|Aymaraes|Apurímac|-13.95944|-73.18528
090718|Tintay Puncu|Tayacaja|Huancavelica|-12.15194|-74.54444
190111|Tinyahuarco|Pasco|Pasco|-10.76972|-76.27694
040411|Tipan|Castilla|Arequipa|-15.72306|-72.50194
210114|Tiquillaca|Puno|Puno|-15.79694|-70.18667
210215|Tirapata|Azángaro|Puno|-14.95500|-70.40278
040517|Tisco|Caylloma|Arequipa|-15.34694|-71.44639
221001|Tocache|Tocache|San Martín|-8.18833|-76.50944
060418|Tocmoche|Chota|Cajamarca|-6.41278|-79.36083
151030|Tomas|Yauyos|Lima|-12.23778|-75.74500
100208|Tomay Kichwa|Ambo|Huánuco|-10.07750|-76.21250
040810|Tomepampa|La Uniòn|Arequipa|-15.17306|-72.83028
061112|Tongod|San Miguel|Cajamarca|-6.75750|-78.82500
180106|Torata|Mariscal Nieto|Moquegua|-17.07667|-70.84417
030416|Toraya|Aymaraes|Apurímac|-14.05306|-73.29389
060615|Toribio Casanova|Cutervo|Cajamarca|-6.00417|-78.69833
040811|Toro|La Uniòn|Arequipa|-15.26444|-72.92833
160110|Torres Causana|Maynas|Loreto|-0.97056|-75.17417
010611|Totora|Rodríguez de Mendoza|Amazonas|-6.49306|-77.47167
050206|Totos|Cangallo|Ayacucho|-13.56750|-74.52278
100904|Tournavista|Puerto Inca|Huánuco|-8.93444|-74.70139
120908|Tres de Diciembre|Chupaca|Junín|-12.10972|-75.24583
220710|Tres Unidos|Picota|San Martín|-6.80583|-76.23222
010523|Trita|Luya|Amazonas|-6.15194|-77.98083
160304|Trompeteros|Loreto|Loreto|-3.80500|-75.06056
130101|Trujillo|Trujillo|La Libertad|-8.10000|-79.03056
140312|Tucume|Lambayeque|Lambayeque|-6.51000|-79.85917
140120|Tuman|Chiclayo|Lambayeque|-6.75111|-79.70111
030217|Tumay Huaraca|Andahuaylas|Apurímac|-14.05278|-73.56583
061204|Tumbaden|San Pablo|Cajamarca|-7.02528|-78.73972
240101|Tumbes|Tumbes|Tumbes|-3.57111|-80.45917
120432|Tunan Marca|Jauja|Junín|-11.72972|-75.57056
080508|Tupac Amaru|Canas|Cusco|-14.16389|-71.47611
110508|Tupac Amaru Inca|Pisco|Ica|-13.71333|-76.14833
151031|Tupe|Yauyos|Lima|-12.74111|-75.80944
030711|Turpay|Grau|Apurímac|-14.22778|-72.62250
030218|Turpo|Andahuaylas|Apurímac|-13.78556|-73.47417
040518|Tuti|Caylloma|Arequipa|-15.53306|-71.55306
180210|Ubinas|General Sánchez Cerro|Moquegua|-16.38667|-70.85556
221005|Uchiza|Tocache|San Martín|-8.45833|-76.46167
130305|Uchumarca|Bolívar|La Libertad|-7.04722|-77.80556
040124|Uchumayo|Arequipa|Arequipa|-16.42528|-71.67250
050410|Uchuraccay|Huanta|Ayacucho|-12.76139|-74.14556
021016|Uco|Huari|Áncash|-9.18833|-76.92833
130306|Ucuncha|Bolívar|La Libertad|-7.16528|-77.85917
120504|Ulcumayo|Junín|Junín|-10.96750|-75.87806
210809|Umachiri|Melgar|Puno|-14.85389|-70.75389
100804|Umari|Pachitea|Huánuco|-9.86417|-76.04444
211307|Unicachi|Yunguyo|Puno|-16.22361|-68.98111
061113|Unión Agua Blanca|San Miguel|Cajamarca|-7.04667|-79.06056
040412|Uñon|Castilla|Arequipa|-15.72861|-72.43222
050708|Upahuacho|Parinacochas|Ayacucho|-14.90722|-73.39750
040413|Uraca|Castilla|Arequipa|-16.22389|-72.46972
030607|Uranmarca|Chincheros|Apurímac|-13.67222|-73.66944
160305|Urarinas|Loreto|Loreto|-4.58750|-74.76722
081201|Urcos|Quispicanchi|Cusco|-13.68778|-71.62528
130813|Urpay|Pataz|La Libertad|-8.34778|-77.38944
081301|Urubamba|Urubamba|Cusco|-13.30556|-72.11611
210310|Usicayos|Carabaya|Puno|-14.12528|-69.96750
130614|Usquil|Otuzco|La Libertad|-7.81528|-78.41667
060311|Utco|Celendín|Cajamarca|-6.89639|-78.06333
061310|Uticyacu|Santa Cruz|Cajamarca|-6.60667|-78.79389
010311|Valera|Bongará|Amazonas|-6.04278|-77.91917
160606|Vargas Guerra|Ucayali|Loreto|-6.91111|-75.15889
150812|Vegueta|Huaura|Lima|-11.02333|-77.64389
200115|Veintiseis de Octubre|Piura|Piura|-5.17917|-80.67806
150612|Veintisiete de Noviembre|Huaral|Lima|-11.19222|-76.77972
080708|Velille|Chumbivilcas|Cusco|-14.50861|-71.88111
070106|Ventanilla|Prov. Const. del Callao|Callao|-11.87722|-77.12778
190112|Vicco|Pasco|Pasco|-10.83833|-76.23833
200805|Vice|Sechura|Piura|-5.42222|-80.77639
200507|Vichayal|Paita|Piura|-4.86417|-81.07306
130111|Victor Larco Herrera|Trujillo|La Libertad|-8.13639|-79.04333
210710|Vilavila|Lampa|Puno|-15.18833|-70.66000
090116|Vilca|Huancavelica|Huancavelica|-12.47722|-75.18333
030712|Vilcabamba|Grau|Apurímac|-14.07778|-72.62472
080909|Vilcabamba|La Convención|Cusco|-13.06306|-72.93444
190208|Vilcabamba|Daniel Alcides Carrión|Pasco|-10.47861|-76.44694
051012|Vilcanchos|Víctor Fajardo|Ayacucho|-13.61139|-74.53250
051101|Vilcas Huamán|Vilcas Huamán|Ayacucho|-13.65250|-73.95389
150142|Villa El Salvador|Lima|Lima|-12.21333|-76.93722
080913|Villa Kintiarina|La Convención|Cusco|-12.91889|-73.52833
150143|Villa María del Triunfo|Lima|Lima|-12.16250|-76.94361
190307|Villa Rica|Oxapampa|Pasco|-10.73917|-75.27583
080912|Villa Virgen|La Convención|Cusco|-13.00278|-73.51278
210115|Vilque|Puno|Puno|-15.76667|-70.25889
210608|Vilque Chico|Huancané|Puno|-15.21389|-69.68917
050114|Vinchos|Huamanga|Ayacucho|-13.24167|-74.35417
151032|Viñac|Yauyos|Lima|-12.93111|-75.78000
120136|Viques|Huancayo|Junín|-12.15972|-75.23194
040414|Viraco|Castilla|Arequipa|-15.65833|-72.52500
131201|Virú|Virú|La Libertad|-8.41444|-78.75278
030713|Virundo|Grau|Apurímac|-14.25028|-72.68111
051108|Vischongo|Vilcas Huamán|Ayacucho|-13.58917|-73.99528
010612|Vista Alegre|Rodríguez de Mendoza|Amazonas|-6.15083|-77.30389
110305|Vista Alegre|Nasca|Ica|-14.84583|-74.94389
151033|Vitis|Yauyos|Lima|-12.22389|-75.80806
120306|Vitoc|Chanchamayo|Junín|-11.21028|-75.33472
040125|Vitor|Arequipa|Arequipa|-16.46583|-71.93583
120609|Vizcatan del Ene|Satipo|Junín|-12.18611|-74.02722
080108|Wanchaq|Cusco|Cusco|-13.52139|-71.96667
100112|Yacus|Huánuco|Huánuco|-9.98611|-76.50583
160804|Yaguas|Putumayo|Loreto|-2.40806|-71.17667
200410|Yamango|Morropón|Piura|-5.18083|-79.75111
010312|Yambrasbamba|Bongará|Amazonas|-5.73528|-77.92500
010707|Yamon|Utcubamba|Amazonas|-6.05083|-78.52889
020906|Yanac|Corongo|Áncash|-8.61861|-77.86472
030417|Yanaca|Aymaraes|Apurímac|-14.22528|-73.16000
120909|Yanacancha|Chupaca|Junín|-12.20111|-75.38667
190113|Yanacancha|Pasco|Pasco|-10.66333|-76.25306
190201|Yanahuanca|Daniel Alcides Carrión|Pasco|-10.49139|-76.51639
040126|Yanahuara|Arequipa|Arequipa|-16.38194|-71.53639
211208|Yanahuaya|Sandia|Puno|-14.25861|-69.16944
022008|Yanama|Yungay|Áncash|-9.02056|-77.47083
080501|Yanaoca|Canas|Cusco|-14.21667|-71.43222
040608|Yanaquihua|Condesuyos|Arequipa|-15.77556|-72.87639
100323|Yanas|Dos de Mayo|Huánuco|-9.71444|-76.75028
080408|Yanatile|Calca|Cusco|-12.68167|-72.27722
040519|Yanque|Caylloma|Arequipa|-15.64833|-71.66083
220106|Yantalo|Moyobamba|San Martín|-5.97444|-77.02083
160511|Yaquerana|Requena|Loreto|-5.14889|-72.87528
040127|Yarabamba|Arequipa|Arequipa|-16.54667|-71.47556
250105|Yarinacocha|Coronel Portillo|Ucayali|-8.35556|-74.57583
100110|Yarumayo|Huánuco|Huánuco|-10.00444|-76.46861
040313|Yauca|Caravelí|Arequipa|-15.66194|-74.52722
110114|Yauca del Rosario|Ica|Ica|-14.09889|-75.47694
090117|Yauli|Huancavelica|Huancavelica|-12.76917|-74.85083
120433|Yauli|Jauja|Junín|-11.71500|-75.47194
120810|Yauli|Yauli|Junín|-11.66583|-76.08583
081009|Yaurisque|Paruro|Cusco|-13.66528|-71.92056
020804|Yautan|Casma|Áncash|-9.51139|-77.99639
020703|Yauya|Carlos Fermín Fitzcarrald|Áncash|-8.99111|-77.29139
120434|Yauyos|Jauja|Junín|-11.78083|-75.49972
151001|Yauyos|Yauyos|Lima|-12.45972|-75.91833
061311|Yauyucan|Santa Cruz|Cajamarca|-6.67722|-78.81861
160403|Yavari|Mariscal Ramón Castilla|Loreto|-4.35361|-70.04167
060508|Yonan|Contumazá|Cajamarca|-7.25306|-79.13111
220808|Yorongos|Rioja|San Martín|-6.13861|-77.14417
081307|Yucay|Urubamba|Cusco|-13.32167|-72.08389
180211|Yunga|General Sánchez Cerro|Moquegua|-16.19500|-70.67778
020611|Yungar|Carhuaz|Áncash|-9.37750|-77.59222
022001|Yungay|Yungay|Áncash|-9.14000|-77.74472
211301|Yunguyo|Yunguyo|Puno|-16.22667|-69.09556
020907|Yupan|Corongo|Áncash|-8.61444|-77.96861
040128|Yura|Arequipa|Arequipa|-16.24694|-71.70639
021210|Yuracmarca|Huaylas|Áncash|-8.73750|-77.90389
220809|Yuracyacu|Rioja|San Martín|-5.93111|-77.22639
160201|Yurimaguas|Alto Amazonas|Loreto|-5.88417|-76.12806
250204|Yurua|Atalaya|Ucayali|-9.53139|-72.76000
100905|Yuyapichis|Puerto Inca|Huánuco|-9.62833|-74.97472
220511|Zapatero|Lamas|San Martín|-6.52972|-76.49417
240301|Zarumilla|Zarumilla|Tumbes|-3.50111|-80.27556
210407|Zepita|Chucuito|Puno|-16.49694|-69.10333
240201|Zorritos|Contralmirante Villar|Tumbes|-3.67750|-80.66806
150516|Zúñiga|Cañete|Lima|-12.86028|-76.02250
080309|Zurite|Anta|Cusco|-13.45583|-72.25583`;

let cache: Zona[] | null = null;

/** Los distritos del país. Se interpretan una sola vez, al primer uso. */
export function zonas(): Zona[] {
  if (cache) return cache;
  cache = CRUDO.split("\n").map((linea) => {
    const [id, nombre, provincia, departamento, lat, lng, niveles] = linea.split("|");
    return {
      id,
      nombre,
      provincia,
      departamento,
      lat: Number(lat),
      lng: Number(lng),
      niveles: niveles === "3" ? 3 : 2,
    } as Zona;
  });
  return cache;
}
