using System;
using System.Security.Cryptography;

namespace HDTBgTracker
{
    public static class Ulid
    {
        private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

        public static string NewUlid()
        {
            var bytes = new byte[16];
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            bytes[0] = (byte)(timestamp >> 40);
            bytes[1] = (byte)(timestamp >> 32);
            bytes[2] = (byte)(timestamp >> 24);
            bytes[3] = (byte)(timestamp >> 16);
            bytes[4] = (byte)(timestamp >> 8);
            bytes[5] = (byte)timestamp;
            using (var rng = RandomNumberGenerator.Create())
            {
                var random = new byte[10];
                rng.GetBytes(random);
                Buffer.BlockCopy(random, 0, bytes, 6, 10);
            }
            return Encode(bytes);
        }

        private static string Encode(byte[] bytes)
        {
            var chars = new char[26];
            var value = new byte[17];
            Buffer.BlockCopy(bytes, 0, value, 1, 16);
            var bitBuffer = 0;
            var bitBufferLength = 0;
            var index = 0;
            foreach (var b in value)
            {
                bitBuffer = (bitBuffer << 8) | b;
                bitBufferLength += 8;
                while (bitBufferLength >= 5 && index < chars.Length)
                {
                    bitBufferLength -= 5;
                    chars[index++] = Alphabet[(bitBuffer >> bitBufferLength) & 31];
                }
            }
            while (index < chars.Length)
            {
                chars[index++] = Alphabet[0];
            }
            return new string(chars);
        }
    }
}

