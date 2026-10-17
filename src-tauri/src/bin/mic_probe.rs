//! Prints what Windows actually says about the capture endpoints: master
//! level, mute and names - the eCapture/eConsole default is what Miro's
//! capture thread ends up on. Diagnostic only, no capture is opened.

use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eCapture, eCommunications, eConsole, IMMDevice, IMMDeviceCollection, IMMDeviceEnumerator,
    MMDeviceEnumerator,
};
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;

fn main() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).expect("enumerator");

        if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole) {
            describe(&device, "eConsole default (the device Miro records)");
        }
        if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eCapture, eCommunications) {
            describe(&device, "eCommunications default");
        }

        let collection: IMMDeviceCollection = enumerator
            .EnumAudioEndpoints(
                eCapture,
                windows::Win32::Media::Audio::DEVICE_STATE(
                    windows::Win32::Media::Audio::DEVICE_STATEMASK_ALL,
                ),
            )
            .expect("endpoints");
        let count = collection.GetCount().unwrap_or(0);
        println!("--- all capture endpoints: {count} ---");
        for index in 0..count {
            if let Ok(device) = collection.Item(index) {
                describe(&device, "endpoint");
            }
        }
    }
    print_cpal_devices();
}

fn describe(device: &IMMDevice, label: &str) {
    let name = unsafe {
        device
            .OpenPropertyStore(STGM_READ)
            .ok()
            .and_then(|store: IPropertyStore| store.GetValue(&PKEY_Device_FriendlyName).ok())
            .map(|prop| prop_wide_string(&prop))
            .unwrap_or_else(|| "<unnamed>".to_string())
    };

    let level = unsafe {
        device
            .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
            .ok()
            .and_then(|volume| volume.GetMasterVolumeLevelScalar().ok())
            .unwrap_or(-1.0)
    };
    let muted = unsafe {
        device
            .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
            .ok()
            .and_then(|volume| volume.GetMute().ok())
            .map(|flag| flag.as_bool())
            .unwrap_or(false)
    };

    let state = match unsafe { device.GetState() } {
        Ok(state) => format!("{:?}", state),
        Err(_) => "<state?>".to_string(),
    };
    println!("{label}: {name} | volume={level:.3} mute={muted} | {state}");
}

fn print_cpal_devices() {
    println!("--- cpal view (what Miro can select) ---");
    for device in miro_lib::audio::list_input_devices() {
        println!(
            "default={} label={:?} id={}",
            device.is_default, device.label, device.id
        );
    }
}

fn prop_wide_string(prop: &PROPVARIANT) -> String {
    unsafe {
        let header = &prop.Anonymous.Anonymous;
        if header.vt != VT_LPWSTR {
            return format!("<vt {}>", header.vt.0);
        }
        let pointer = prop.Anonymous.Anonymous.Anonymous.pwszVal;
        if pointer.0.is_null() {
            return String::new();
        }
        pointer.to_string().unwrap_or_default()
    }
}
