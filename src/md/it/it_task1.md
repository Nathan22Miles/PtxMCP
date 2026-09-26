I am working toward the goal of expanding this mcp server to
fetch interlinear text from Paratext.

The first step is to document the structure of this interlinear data.

An exmaple of the kind of data I eventually want to return is it_rom_1.1.json.
This data contains pairs where the first item in the pair is a word
from the Biblical text in the project language and the second word
is its gloss in a widely known language, in this case English.

The example data for this is in the folder myParatextProjects/AKG-Uni
- Interlinear_en/Interlinear_en_ROM.xml
    - interlinear data for 'en' language for all of Romans
    - the data for ROM 1.1 is lines 902-1199
    - Ignore all <Cluster> elments that contain a <Lexeme Id="Phrase:*> element
        - These are out of scope for now
- lexicon.xml
    - Contains <Sense> entries that give for each sense id a gloss in the widely known language
    - The gloss for the first word of ROM 1.1 is found in lines 17307-17320

Document the structure of this interlinear data

Place this information in the 'Data Layout' section of it_spec.md

Document the data in a way that facilitates later implementing a mcp
command to fetch this data.

The .xml files here are quite large. Do not try to read the entire
content of the files. Sample the files as necessary.