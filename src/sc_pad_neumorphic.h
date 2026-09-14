#pragma once
#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif
typedef enum {
    SC_PAD_NEU_RAISED,
    SC_PAD_NEU_INSET,
    SC_PAD_NEU_SHADOW,
} sc_pad_neu_kind_t;

const lv_img_dsc_t *sc_pad_neu_image(int width, int height, sc_pad_neu_kind_t kind);
#ifdef __cplusplus
}
#endif
