use nnnoiseless::DenoiseState;

struct Denoiser {
    state: Box<DenoiseState<'static>>,
    input: [f32; DenoiseState::FRAME_SIZE],
    output: [f32; DenoiseState::FRAME_SIZE],
}

#[no_mangle]
extern "C" fn denoiser_create() -> *mut Denoiser {
    Box::into_raw(Box::new(Denoiser {
        state: DenoiseState::new(),
        input: [0.0; DenoiseState::FRAME_SIZE],
        output: [0.0; DenoiseState::FRAME_SIZE],
    }))
}

#[no_mangle]
unsafe extern "C" fn denoiser_input(denoiser: *mut Denoiser) -> *mut f32 {
    (*denoiser).input.as_mut_ptr()
}

#[no_mangle]
unsafe extern "C" fn denoiser_output(denoiser: *mut Denoiser) -> *const f32 {
    (*denoiser).output.as_ptr()
}

#[no_mangle]
unsafe extern "C" fn denoiser_process(denoiser: *mut Denoiser) {
    let denoiser = &mut *denoiser;
    denoiser.state.process_frame(&mut denoiser.output, &denoiser.input);
}

#[no_mangle]
unsafe extern "C" fn denoiser_destroy(denoiser: *mut Denoiser) {
    drop(Box::from_raw(denoiser));
}
