"""Static reference data: Sri Lankan districts -> cities/towns.
Trimmed to common towns; admin can add more shipping rules per row.
"""

SL_DISTRICT_CITIES = {
    "Colombo": ["Colombo 01", "Colombo 02", "Colombo 03", "Colombo 04", "Colombo 05", "Colombo 06", "Colombo 07", "Colombo 08", "Colombo 09", "Colombo 10", "Colombo 11", "Colombo 12", "Colombo 13", "Colombo 14", "Colombo 15", "Dehiwala", "Mount Lavinia", "Moratuwa", "Maharagama", "Kotte", "Nugegoda", "Battaramulla", "Rajagiriya", "Kaduwela", "Homagama", "Piliyandala", "Kesbewa", "Athurugiriya", "Malabe", "Kollupitiya"],
    "Gampaha": ["Negombo", "Gampaha", "Wattala", "Ja-Ela", "Kelaniya", "Kiribathgoda", "Kadawatha", "Ragama", "Minuwangoda", "Divulapitiya", "Kandana", "Nittambuwa", "Veyangoda", "Mirigama", "Kirindiwela", "Ganemulla", "Mahara"],
    "Kalutara": ["Kalutara", "Panadura", "Beruwala", "Aluthgama", "Horana", "Matugama", "Bandaragama", "Wadduwa", "Ingiriya"],
    "Kandy": ["Kandy", "Peradeniya", "Katugastota", "Gampola", "Nawalapitiya", "Akurana", "Pilimathalawa", "Kadugannawa", "Wattegama", "Pussellawa", "Digana", "Kundasale"],
    "Matale": ["Matale", "Dambulla", "Galewela", "Sigiriya", "Ukuwela", "Naula"],
    "Nuwara Eliya": ["Nuwara Eliya", "Hatton", "Talawakelle", "Nanu Oya", "Kandapola", "Ginigathena", "Ragala"],
    "Galle": ["Galle", "Hikkaduwa", "Ambalangoda", "Bentota", "Elpitiya", "Karapitiya", "Unawatuna", "Baddegama", "Habaraduwa"],
    "Matara": ["Matara", "Weligama", "Mirissa", "Akuressa", "Dikwella", "Hakmana", "Kamburupitiya"],
    "Hambantota": ["Hambantota", "Tangalle", "Tissamaharama", "Beliatta", "Ambalantota", "Weeraketiya"],
    "Jaffna": ["Jaffna", "Nallur", "Chavakachcheri", "Point Pedro", "Velanai", "Karainagar"],
    "Kilinochchi": ["Kilinochchi", "Pallai", "Paranthan"],
    "Mannar": ["Mannar", "Nanattan", "Madhu", "Pesalai"],
    "Mullaitivu": ["Mullaitivu", "Puthukkudiyiruppu", "Oddusuddan"],
    "Vavuniya": ["Vavuniya", "Nedunkeni", "Cheddikulam"],
    "Trincomalee": ["Trincomalee", "Kinniya", "Mutur", "Kantale", "Nilaveli"],
    "Batticaloa": ["Batticaloa", "Kattankudy", "Eravur", "Valaichchenai", "Kaluwanchikudy"],
    "Ampara": ["Ampara", "Kalmunai", "Sainthamaruthu", "Akkaraipattu", "Sammanthurai", "Pottuvil", "Dehiattakandiya"],
    "Kurunegala": ["Kurunegala", "Kuliyapitiya", "Polgahawela", "Pannala", "Wariyapola", "Mawathagama", "Narammala", "Ibbagamuwa"],
    "Puttalam": ["Puttalam", "Chilaw", "Wennappuwa", "Marawila", "Anamaduwa", "Nattandiya", "Dankotuwa"],
    "Anuradhapura": ["Anuradhapura", "Mihintale", "Kekirawa", "Medawachchiya", "Eppawala", "Galnewa"],
    "Polonnaruwa": ["Polonnaruwa", "Hingurakgoda", "Medirigiriya", "Dimbulagala"],
    "Badulla": ["Badulla", "Bandarawela", "Haputale", "Ella", "Welimada", "Mahiyangana", "Diyatalawa", "Passara"],
    "Monaragala": ["Monaragala", "Wellawaya", "Bibile", "Buttala", "Kataragama"],
    "Ratnapura": ["Ratnapura", "Embilipitiya", "Balangoda", "Pelmadulla", "Kuruwita", "Eheliyagoda"],
    "Kegalle": ["Kegalle", "Mawanella", "Warakapola", "Rambukkana", "Yatiyantota", "Ruwanwella"],
}


def all_districts():
    return sorted(SL_DISTRICT_CITIES.keys())


def cities_for(district: str):
    return SL_DISTRICT_CITIES.get(district, [])
