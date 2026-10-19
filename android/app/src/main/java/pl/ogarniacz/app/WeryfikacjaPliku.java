package pl.ogarniacz.app;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

final class WeryfikacjaPliku {
    static void sprawdz(InputStream odczyt, byte[] oczekiwane) throws IOException {
        porownaj(odczyt, new ByteArrayInputStream(oczekiwane));
    }

    static void porownaj(InputStream odczyt, InputStream oryginal) throws IOException {
        if (odczyt == null || oryginal == null || !MessageDigest.isEqual(skrot(odczyt), skrot(oryginal))) {
            throw new IOException("Zawartość odczytanego pliku jest niezgodna.");
        }
    }

    private static byte[] skrot(InputStream strumien) throws IOException {
        try {
            MessageDigest skrot = MessageDigest.getInstance("SHA-256");
            byte[] bufor = new byte[8192];
            int liczba;
            while ((liczba = strumien.read(bufor)) != -1) skrot.update(bufor, 0, liczba);
            return skrot.digest();
        } catch (NoSuchAlgorithmException przyczyna) {
            throw new IOException("Brak SHA-256.", przyczyna);
        }
    }
}
