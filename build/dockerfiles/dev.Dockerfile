# Copyright (c) 2022 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#

FROM quay.io/devfile/universal-developer-image:latest

USER 0

RUN dnf -y install libsecret libX11-devel libxkbcommon \
    "https://rpmfind.net/linux/centos-stream/9-stream/AppStream/x86_64/os/Packages/libsecret-devel-0.20.4-4.el9.x86_64.rpm" \
    "https://rpmfind.net/linux/centos-stream/9-stream/AppStream/x86_64/os/Packages/libxkbfile-1.1.0-8.el9.x86_64.rpm" \
    "https://rpmfind.net/linux/centos-stream/9-stream/CRB/x86_64/os/Packages/libxkbfile-devel-1.1.0-8.el9.x86_64.rpm" \
    "https://rpmfind.net/linux/centos-stream/9-stream/BaseOS/x86_64/os/Packages/zsh-5.8-9.el9.x86_64.rpm" \
    util-linux-user && \
    dnf -y clean all --enablerepo='*'

COPY --chmod=664 /build/conf/dev/.p10k.zsh /home/user/.p10k.zsh

# zsh support
RUN wget https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh -O - | zsh && \
    cp $HOME/.oh-my-zsh/templates/zshrc.zsh-template $HOME/.zshrc && \
    chsh -s $(which zsh) root && \
    git clone --depth=1 https://github.com/romkatv/powerlevel10k.git $HOME/.oh-my-zsh/custom/themes/powerlevel10k && \
    git clone --depth=1 https://github.com/zsh-users/zsh-autosuggestions $HOME/.oh-my-zsh/custom/plugins/zsh-autosuggestions && \
    sed -i 's|\(ZSH_THEME="\).*|\1powerlevel10k/powerlevel10k"|' $HOME/.zshrc && \
    # Add zsh autosuggestions plug-in
    sed -i 's|plugins=(\(.*\))|plugins=(\1 zsh-autosuggestions)|' $HOME/.zshrc && \
    echo "[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh" >> $HOME/.zshrc
ENV ZSH_DISABLE_COMPFIX="true"

USER 10001

ENV NODEJS_VERSION=22.16.0

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 \
    PATH=$NVM_DIR/versions/node/v$NODEJS_VERSION/bin:$PATH

RUN source $NVM_DIR/nvm.sh && \
    nvm install v$NODEJS_VERSION && \
    nvm alias default v$NODEJS_VERSION && \
    nvm use v$NODEJS_VERSION

USER 0
RUN npm install --global npm@9.7.2 node-gyp@9

# Set permissions on /home/user/.cache to allow the user to write
RUN chgrp -R 0 /home/user/.cache && chmod -R g=u /home/user/.cache

USER 10001
