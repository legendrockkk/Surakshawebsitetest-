# Suraksha — SOS Safety

एक tap में अपने emergency contacts को SOS message और live location भेजने वाली website। Phone पर app की तरह install हो जाती है।

## कैसे काम करती है
1. पहली बार अपना नाम और 1–5 emergency contacts save करो — जानकारी सिर्फ उसी phone में रहती है (localStorage), कहीं upload नहीं होती।
2. **SOS** दबाओ → phone की ताज़ा GPS location के साथ SMS तैयार होकर खुलता है, सभी contacts एक साथ भरे हुए → बस **Send** दबाना है।
3. SOS चालू रहने तक screen पर live location update होती रहती है (screen सोती नहीं); हर 2 minute पर app याद दिलाता है — "नई location सबको भेजो" एक tap में तैयार SMS देता है।
4. **✓ मैं Safe हूँ** दबाओ → सभी contacts को safe होने का SMS तैयार मिलता है और SOS बंद हो जाता है।
5. Test message button से पहले ही परख सकते हो कि सब ठीक काम करता है।

## सच जो जानना ज़रूरी है
- कोई भी website चुपचाप SMS नहीं भेज सकती — ये हर browser का नियम है। इसलिए message तैयार मिलता है, Send का एक tap लगता है।
- Location तभी update होती है जब app खुला हो और phone की Location चालू हो।
