"""
Quick test script for the TTS server
Run this after starting the server to verify it's working
"""

import os
import requests
import json

SERVER_URL = os.environ.get("LOCAL_TTS_SERVER_URL", "http://localhost:5001")

def test_health():
    """Test the health endpoint"""
    print("🔍 Testing health endpoint...")
    try:
        response = requests.get(f"{SERVER_URL}/health")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed!")
            print(f"   Status: {data.get('status')}")
            print(f"   Model: {data.get('model')}")
            print(f"   Device: {data.get('device')}")
            print(f"   Model Loaded: {data.get('model_loaded')}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

def test_voices():
    """Test the voices endpoint"""
    print("\n🔍 Testing voices endpoint...")
    try:
        response = requests.get(f"{SERVER_URL}/voices")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Voices endpoint working!")
            print(f"   Info: {data.get('info')}")
            print(f"   Supported Languages: {len(data.get('supported_languages', []))} languages")
            return True
        else:
            print(f"❌ Voices check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Voices check error: {e}")
        return False

def test_tts():
    """Test basic TTS generation"""
    print("\n🔍 Testing TTS generation...")
    try:
        payload = {
            "text": "Hello, this is a test of the text to speech system.",
            "language": "en"
        }
        
        response = requests.post(
            f"{SERVER_URL}/tts",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            content_length = len(response.content)
            
            if 'audio' in content_type and content_length > 1000:
                print(f"✅ TTS generation successful!")
                print(f"   Content-Type: {content_type}")
                print(f"   Audio Size: {content_length} bytes")
                
                # Optionally save the audio
                with open('test_output.wav', 'wb') as f:
                    f.write(response.content)
                print(f"   Saved to: test_output.wav")
                return True
            else:
                print(f"❌ Invalid audio response")
                print(f"   Content-Type: {content_type}")
                print(f"   Size: {content_length} bytes")
                return False
        else:
            print(f"❌ TTS generation failed: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Error: {error_data.get('error', 'Unknown error')}")
            except:
                print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ TTS generation error: {e}")
        return False

def main():
    print("=" * 60)
    print("🧪 TTS Server Test Suite")
    print("=" * 60)
    
    # Run tests
    health_ok = test_health()
    voices_ok = test_voices()
    tts_ok = test_tts()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Summary")
    print("=" * 60)
    print(f"Health Check: {'✅ PASS' if health_ok else '❌ FAIL'}")
    print(f"Voices Check: {'✅ PASS' if voices_ok else '❌ FAIL'}")
    print(f"TTS Generation: {'✅ PASS' if tts_ok else '❌ FAIL'}")
    
    if health_ok and voices_ok and tts_ok:
        print("\n🎉 All tests passed! Server is working correctly.")
        return 0
    else:
        print("\n⚠️ Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    exit(main())
